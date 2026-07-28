#![no_std]
//! Celerity — a programmable disaster-disbursement rail on Stellar/Soroban.
//!
//! Funders deposit into a shared on-chain escrow, each with an earmarked
//! sub-pool and its own release rule. An objective, multi-sig weather event
//! (Ed25519 threshold over authorized oracle keys) triggers automatic release
//! to pre-registered farmers. Every release is logged per funder.
//!
//! Design rules: the contract never interprets documents; it verifies
//! signatures and compares numbers. Funders are independent. On an underfunded
//! pool mid-event we flag, never silently fail. Releases are idempotent on a
//! composite settled-key. Every mutator emits a Soroban event.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Bytes, BytesN, Env, Vec,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 2,
    PoolNotFound = 3,
    FarmerNotFound = 4,
    FarmerAlreadyRegistered = 5,
    InvalidAmount = 6,
    InvalidPayout = 7,
    InvalidInstallments = 8,
    PoolNotPaused = 9,
    NonceAlreadyUsed = 10,
    EventNotFound = 11,
    InvalidPeriod = 12,
    PoolPaused = 13,
    PoolUnderfunded = 14,
    NothingToClaim = 15,
    AllInstallmentsPaid = 16,
    ClaimNotDueYet = 17,
    RegionMismatch = 18,
    NotExpiredYet = 19,
    InsufficientOracleSigs = 20,
    InvalidOracleConfig = 21,
}

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PoolStatus {
    Active,
    Paused,
    Exhausted,
}

/// One funder's earmarked escrow: its own balance, region, threshold, rule.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubPool {
    pub funder: Address,
    pub balance: i128,
    pub region: u32,
    pub signal_threshold: u32,
    pub payout_per_farmer: i128,
    pub installments: u32,
    pub claim_period_secs: u64,
    /// Unix ledger seconds; `0` = no expiry (withdraw anytime).
    pub trigger_expiry: u64,
    pub status: PoolStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Farmer {
    pub addr: Address,
    pub region: u32,
    pub registered_by: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Event {
    pub region: u32,
    pub signal: u32,
}

/// One oracle signature bound to a key index (avoids try-verify traps).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleSig {
    pub key_index: u32,
    pub signature: BytesN<64>,
}

const EVENT_PAYLOAD_PREFIX: &[u8; 17] = b"CELERITY-EVENT-V1";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Release {
    pub event_id: u64,
    pub pool_id: u64,
    pub funder: Address,
    pub farmer: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstallmentProgress {
    pub paid: u32,
    pub event_id: u64,
    pub last_ts: u64,
}

#[contracttype]
pub enum DataKey {
    Pool(u64),
    FarmerReg(Address),
    Settled(u64, Address, u64),
    Event(u64),
    UsedNonce(u64),
    Progress(u64, Address),
    Ledger(Address),
    RegionFarmers(u32),
    Token,
    OracleKeys,
    OracleThreshold,
    Admin,
    NextPoolId,
    NextEventId,
}

// ---------------------------------------------------------------------------
// Internal storage helpers
// ---------------------------------------------------------------------------

fn get_admin(e: &Env) -> Address {
    e.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(e, Error::NotInitialized))
}

fn get_token(e: &Env) -> Address {
    e.storage()
        .instance()
        .get(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(e, Error::NotInitialized))
}

fn get_oracle_keys(e: &Env) -> Vec<BytesN<32>> {
    e.storage()
        .instance()
        .get(&DataKey::OracleKeys)
        .unwrap_or_else(|| panic_with_error!(e, Error::NotInitialized))
}

fn get_oracle_threshold(e: &Env) -> u32 {
    e.storage()
        .instance()
        .get(&DataKey::OracleThreshold)
        .unwrap_or_else(|| panic_with_error!(e, Error::NotInitialized))
}

fn get_pool(e: &Env, pool_id: u64) -> SubPool {
    e.storage()
        .persistent()
        .get(&DataKey::Pool(pool_id))
        .unwrap_or_else(|| panic_with_error!(e, Error::PoolNotFound))
}

fn save_pool(e: &Env, pool_id: u64, pool: &SubPool) {
    e.storage().persistent().set(&DataKey::Pool(pool_id), pool);
}

fn region_farmers(e: &Env, region: u32) -> Vec<Address> {
    e.storage()
        .persistent()
        .get(&DataKey::RegionFarmers(region))
        .unwrap_or_else(|| Vec::new(e))
}

fn event_payload_bytes(e: &Env, region: u32, signal: u32, nonce: u64) -> Bytes {
    let mut payload = Bytes::from_slice(e, EVENT_PAYLOAD_PREFIX);
    payload.extend_from_array(&region.to_be_bytes());
    payload.extend_from_array(&signal.to_be_bytes());
    payload.extend_from_array(&nonce.to_be_bytes());
    payload
}

/// Verify indexed oracle signatures; each key_index may count at most once.
fn verify_oracle_threshold(e: &Env, region: u32, signal: u32, nonce: u64, sigs: &Vec<OracleSig>) {
    let keys = get_oracle_keys(e);
    let threshold = get_oracle_threshold(e);
    if keys.is_empty() || threshold == 0 || threshold > keys.len() {
        panic_with_error!(e, Error::InvalidOracleConfig);
    }
    let payload = event_payload_bytes(e, region, signal, nonce);
    let mut used: Vec<u32> = Vec::new(e);
    let mut valid: u32 = 0;
    for s in sigs.iter() {
        if s.key_index >= keys.len() {
            panic_with_error!(e, Error::InvalidOracleConfig);
        }
        let mut already = false;
        for u in used.iter() {
            if u == s.key_index {
                already = true;
                break;
            }
        }
        if already {
            continue;
        }
        let key = keys.get(s.key_index).unwrap();
        e.crypto().ed25519_verify(&key, &payload, &s.signature);
        used.push_back(s.key_index);
        valid += 1;
        if valid >= threshold {
            return;
        }
    }
    panic_with_error!(e, Error::InsufficientOracleSigs);
}

#[contract]
pub struct Celerity;

#[contractimpl]
impl Celerity {
    /// Atomic deploy init: registry admin, oracle key set + threshold, settlement SAC.
    pub fn __constructor(
        e: Env,
        admin: Address,
        oracle_keys: Vec<BytesN<32>>,
        threshold: u32,
        token: Address,
    ) {
        if oracle_keys.is_empty() || threshold == 0 || threshold > oracle_keys.len() {
            panic_with_error!(&e, Error::InvalidOracleConfig);
        }
        // Reject duplicate oracle pubkeys (one signer must not fill two slots).
        let n = oracle_keys.len();
        for i in 0..n {
            for j in (i + 1)..n {
                if oracle_keys.get(i).unwrap() == oracle_keys.get(j).unwrap() {
                    panic_with_error!(&e, Error::InvalidOracleConfig);
                }
            }
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage()
            .instance()
            .set(&DataKey::OracleKeys, &oracle_keys);
        e.storage()
            .instance()
            .set(&DataKey::OracleThreshold, &threshold);
        e.storage().instance().set(&DataKey::Token, &token);
        e.storage().instance().set(&DataKey::NextPoolId, &1u64);
        e.storage().instance().set(&DataKey::NextEventId, &1u64);
    }

    /// Rotate registry authority. Current admin must authorize.
    pub fn set_admin(e: Env, new_admin: Address) {
        let admin = get_admin(&e);
        admin.require_auth();
        e.storage().instance().set(&DataKey::Admin, &new_admin);
        e.events()
            .publish((symbol_short!("set_admin"),), (admin, new_admin));
    }

    pub fn deposit(
        e: Env,
        funder: Address,
        amount: i128,
        region: u32,
        threshold: u32,
        payout: i128,
        installments: u32,
        claim_period_secs: u64,
        trigger_expiry: u64,
    ) -> u64 {
        funder.require_auth();
        if amount <= 0 {
            panic_with_error!(&e, Error::InvalidAmount);
        }
        if payout <= 0 {
            panic_with_error!(&e, Error::InvalidPayout);
        }
        if installments < 1 {
            panic_with_error!(&e, Error::InvalidInstallments);
        }
        if installments > 1 && claim_period_secs == 0 {
            panic_with_error!(&e, Error::InvalidPeriod);
        }
        let now = e.ledger().timestamp();
        if trigger_expiry != 0 && trigger_expiry <= now {
            panic_with_error!(&e, Error::InvalidPeriod);
        }

        token::TokenClient::new(&e, &get_token(&e)).transfer(
            &funder,
            &e.current_contract_address(),
            &amount,
        );

        let pool_id: u64 = e
            .storage()
            .instance()
            .get(&DataKey::NextPoolId)
            .unwrap_or_else(|| panic_with_error!(&e, Error::NotInitialized));
        e.storage()
            .instance()
            .set(&DataKey::NextPoolId, &(pool_id + 1));

        save_pool(
            &e,
            pool_id,
            &SubPool {
                funder: funder.clone(),
                balance: amount,
                region,
                signal_threshold: threshold,
                payout_per_farmer: payout,
                installments,
                claim_period_secs,
                trigger_expiry,
                status: PoolStatus::Active,
            },
        );
        e.events()
            .publish((symbol_short!("deposit"), funder), (pool_id, amount));
        pool_id
    }

    pub fn top_up(e: Env, pool_id: u64, amount: i128) {
        let mut pool = get_pool(&e, pool_id);
        pool.funder.require_auth();
        if amount <= 0 {
            panic_with_error!(&e, Error::InvalidAmount);
        }

        token::TokenClient::new(&e, &get_token(&e)).transfer(
            &pool.funder,
            &e.current_contract_address(),
            &amount,
        );

        pool.balance += amount;
        if pool.status == PoolStatus::Exhausted {
            pool.status = PoolStatus::Active;
        }
        save_pool(&e, pool_id, &pool);
        e.events()
            .publish((symbol_short!("top_up"), pool_id), amount);
    }

    /// Return unspent balance to the funder.
    /// `trigger_expiry == 0`: anytime. Otherwise only when `now >= trigger_expiry`.
    pub fn withdraw_unspent(e: Env, pool_id: u64) {
        let mut pool = get_pool(&e, pool_id);
        pool.funder.require_auth();
        if pool.trigger_expiry != 0 && e.ledger().timestamp() < pool.trigger_expiry {
            panic_with_error!(&e, Error::NotExpiredYet);
        }

        let amount = pool.balance;
        if amount > 0 {
            token::TokenClient::new(&e, &get_token(&e)).transfer(
                &e.current_contract_address(),
                &pool.funder,
                &amount,
            );
        }
        pool.balance = 0;
        save_pool(&e, pool_id, &pool);
        e.events()
            .publish((symbol_short!("withdraw"), pool_id), amount);
    }

    pub fn pause_pool(e: Env, pool_id: u64) {
        let mut pool = get_pool(&e, pool_id);
        pool.funder.require_auth();
        pool.status = PoolStatus::Paused;
        save_pool(&e, pool_id, &pool);
        e.events()
            .publish((symbol_short!("pause"), pool_id), ());
    }

    pub fn resume_pool(e: Env, pool_id: u64) {
        let mut pool = get_pool(&e, pool_id);
        pool.funder.require_auth();
        if pool.status != PoolStatus::Paused {
            panic_with_error!(&e, Error::PoolNotPaused);
        }
        pool.status = PoolStatus::Active;
        save_pool(&e, pool_id, &pool);
        e.events()
            .publish((symbol_short!("resume"), pool_id), ());
    }

    pub fn register_farmer(e: Env, addr: Address, region: u32) {
        let admin = get_admin(&e);
        admin.require_auth();

        if e.storage()
            .persistent()
            .has(&DataKey::FarmerReg(addr.clone()))
        {
            panic_with_error!(&e, Error::FarmerAlreadyRegistered);
        }

        e.storage().persistent().set(
            &DataKey::FarmerReg(addr.clone()),
            &Farmer {
                addr: addr.clone(),
                region,
                registered_by: admin,
            },
        );

        let mut list = region_farmers(&e, region);
        list.push_back(addr.clone());
        e.storage()
            .persistent()
            .set(&DataKey::RegionFarmers(region), &list);
        e.events()
            .publish((symbol_short!("reg_farm"), addr), region);
    }

    pub fn remove_farmer(e: Env, addr: Address) {
        let admin = get_admin(&e);
        admin.require_auth();

        let farmer: Farmer = e
            .storage()
            .persistent()
            .get(&DataKey::FarmerReg(addr.clone()))
            .unwrap_or_else(|| panic_with_error!(&e, Error::FarmerNotFound));

        e.storage()
            .persistent()
            .remove(&DataKey::FarmerReg(addr.clone()));

        let list = region_farmers(&e, farmer.region);
        if let Some(pos) = list.first_index_of(&addr) {
            let mut list = list;
            list.remove(pos);
            e.storage()
                .persistent()
                .set(&DataKey::RegionFarmers(farmer.region), &list);
        }
        e.events()
            .publish((symbol_short!("rm_farm"), addr), ());
    }

    /// Threshold oracle report. Anyone may relay; signatures are the authority.
    pub fn report_event(
        e: Env,
        region: u32,
        signal: u32,
        nonce: u64,
        sigs: Vec<OracleSig>,
    ) -> u64 {
        if e.storage().persistent().has(&DataKey::UsedNonce(nonce)) {
            panic_with_error!(&e, Error::NonceAlreadyUsed);
        }

        verify_oracle_threshold(&e, region, signal, nonce, &sigs);

        e.storage()
            .persistent()
            .set(&DataKey::UsedNonce(nonce), &true);

        let event_id: u64 = e
            .storage()
            .instance()
            .get(&DataKey::NextEventId)
            .unwrap_or_else(|| panic_with_error!(&e, Error::NotInitialized));
        e.storage()
            .instance()
            .set(&DataKey::NextEventId, &(event_id + 1));
        e.storage()
            .persistent()
            .set(&DataKey::Event(event_id), &Event { region, signal });
        e.events()
            .publish((symbol_short!("event"), event_id), (region, signal));
        event_id
    }

    pub fn settle_event(e: Env, event_id: u64) -> u32 {
        let event: Event = e
            .storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .unwrap_or_else(|| panic_with_error!(&e, Error::EventNotFound));

        let farmers = region_farmers(&e, event.region);
        let token = token::TokenClient::new(&e, &get_token(&e));
        let next_pool_id: u64 = e
            .storage()
            .instance()
            .get(&DataKey::NextPoolId)
            .unwrap_or(1);
        let mut released: u32 = 0;

        for pool_id in 1..next_pool_id {
            let mut pool: SubPool = match e.storage().persistent().get(&DataKey::Pool(pool_id)) {
                Some(p) => p,
                None => continue,
            };
            if pool.status != PoolStatus::Active
                || pool.region != event.region
                || event.signal < pool.signal_threshold
            {
                continue;
            }

            let mut dirty = false;
            for farmer in farmers.iter() {
                let settled_key = DataKey::Settled(event_id, farmer.clone(), pool_id);
                if e.storage().persistent().has(&settled_key) {
                    continue;
                }

                if pool.installments > 1 {
                    let progress_key = DataKey::Progress(pool_id, farmer.clone());
                    if let Some(p) = e
                        .storage()
                        .persistent()
                        .get::<DataKey, InstallmentProgress>(&progress_key)
                    {
                        if p.paid < pool.installments {
                            continue;
                        }
                    }
                }

                if pool.balance < pool.payout_per_farmer {
                    pool.status = PoolStatus::Exhausted;
                    dirty = true;
                    e.events().publish(
                        (symbol_short!("exhausted"), pool.funder.clone()),
                        (event_id, pool_id),
                    );
                    break;
                }

                token.transfer(&e.current_contract_address(), &farmer, &pool.payout_per_farmer);
                pool.balance -= pool.payout_per_farmer;
                dirty = true;
                e.storage().persistent().set(&settled_key, &true);

                let release = Release {
                    event_id,
                    pool_id,
                    funder: pool.funder.clone(),
                    farmer: farmer.clone(),
                    amount: pool.payout_per_farmer,
                };
                let mut ledger: Vec<Release> = e
                    .storage()
                    .persistent()
                    .get(&DataKey::Ledger(pool.funder.clone()))
                    .unwrap_or_else(|| Vec::new(&e));
                ledger.push_back(release);
                e.storage()
                    .persistent()
                    .set(&DataKey::Ledger(pool.funder.clone()), &ledger);

                if pool.installments > 1 {
                    e.storage().persistent().set(
                        &DataKey::Progress(pool_id, farmer.clone()),
                        &InstallmentProgress {
                            paid: 1,
                            event_id,
                            last_ts: e.ledger().timestamp(),
                        },
                    );
                }

                e.events().publish(
                    (symbol_short!("release"), pool.funder.clone(), farmer.clone()),
                    (event_id, pool_id, pool.payout_per_farmer),
                );
                released += 1;
            }
            if dirty {
                save_pool(&e, pool_id, &pool);
            }
        }
        released
    }

    pub fn claim(e: Env, farmer: Address, pool_id: u64) {
        farmer.require_auth();
        let registered: Farmer = e
            .storage()
            .persistent()
            .get(&DataKey::FarmerReg(farmer.clone()))
            .unwrap_or_else(|| panic_with_error!(&e, Error::FarmerNotFound));
        let mut pool = get_pool(&e, pool_id);
        if registered.region != pool.region {
            panic_with_error!(&e, Error::RegionMismatch);
        }
        if pool.status == PoolStatus::Paused {
            panic_with_error!(&e, Error::PoolPaused);
        }

        let progress_key = DataKey::Progress(pool_id, farmer.clone());
        let mut progress: InstallmentProgress = e
            .storage()
            .persistent()
            .get(&progress_key)
            .unwrap_or_else(|| panic_with_error!(&e, Error::NothingToClaim));

        if progress.paid >= pool.installments {
            panic_with_error!(&e, Error::AllInstallmentsPaid);
        }
        let now = e.ledger().timestamp();
        if now < progress.last_ts.saturating_add(pool.claim_period_secs) {
            panic_with_error!(&e, Error::ClaimNotDueYet);
        }
        if pool.balance < pool.payout_per_farmer {
            panic_with_error!(&e, Error::PoolUnderfunded);
        }

        token::TokenClient::new(&e, &get_token(&e)).transfer(
            &e.current_contract_address(),
            &farmer,
            &pool.payout_per_farmer,
        );
        pool.balance -= pool.payout_per_farmer;
        save_pool(&e, pool_id, &pool);

        progress.paid += 1;
        progress.last_ts = now;
        e.storage().persistent().set(&progress_key, &progress);

        let mut ledger: Vec<Release> = e
            .storage()
            .persistent()
            .get(&DataKey::Ledger(pool.funder.clone()))
            .unwrap_or_else(|| Vec::new(&e));
        ledger.push_back(Release {
            event_id: progress.event_id,
            pool_id,
            funder: pool.funder.clone(),
            farmer: farmer.clone(),
            amount: pool.payout_per_farmer,
        });
        e.storage()
            .persistent()
            .set(&DataKey::Ledger(pool.funder.clone()), &ledger);

        e.events().publish(
            (symbol_short!("claim"), pool.funder, farmer),
            (progress.event_id, pool_id, pool.payout_per_farmer),
        );
    }

    pub fn pool(e: Env, pool_id: u64) -> SubPool {
        get_pool(&e, pool_id)
    }

    pub fn event(e: Env, event_id: u64) -> Event {
        e.storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .unwrap_or_else(|| panic_with_error!(&e, Error::EventNotFound))
    }

    pub fn farmer(e: Env, addr: Address) -> Farmer {
        e.storage()
            .persistent()
            .get(&DataKey::FarmerReg(addr))
            .unwrap_or_else(|| panic_with_error!(&e, Error::FarmerNotFound))
    }

    pub fn farmers_in_region(e: Env, region: u32) -> Vec<Address> {
        region_farmers(&e, region)
    }

    pub fn funder_ledger(e: Env, funder: Address) -> Vec<Release> {
        e.storage()
            .persistent()
            .get(&DataKey::Ledger(funder))
            .unwrap_or_else(|| Vec::new(&e))
    }
}

mod test;
