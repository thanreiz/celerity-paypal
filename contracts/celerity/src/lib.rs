#![no_std]
//! Celerity — a programmable disaster-disbursement rail on Stellar/Soroban.
//!
//! Funders deposit into a shared on-chain escrow, each with an earmarked
//! sub-pool and its own release rule. An objective, signed weather event
//! (an Ed25519-signed typhoon signal from an authorized oracle key) triggers
//! automatic release to pre-registered farmers. Every release is logged per
//! funder.
//!
//! Design rules (see CLAUDE.md): the contract never interprets documents; it
//! verifies a signature and compares numbers. Funders are independent. On an
//! underfunded pool mid-event we flag, never silently fail. Releases are
//! idempotent on a composite settled-key.
//!
//! Phase 1 implements the core escrow (deposit / top_up / withdraw_unspent /
//! pause_pool) and the farmer registry. The oracle path (report_event),
//! settlement (settle_event), and recurring claim remain stubs until
//! Phases 2–4.

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
}

// ---------------------------------------------------------------------------
// Data model (doc §6.2 / §10)
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
    pub installments: u32,      // 1 = lump, >1 = recurring
    pub claim_period_secs: u64, // min seconds between installments (recurring only)
    pub status: PoolStatus,
}

/// A pre-registered payee, enrolled by an LGU/co-op admin (not the contract).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Farmer {
    pub addr: Address,
    pub region: u32,
    pub registered_by: Address,
}

/// A signed weather event that has entered the contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Event {
    pub region: u32,
    pub signal: u32,
}

/// Domain-separation prefix for the oracle's signed payload. The full message
/// the oracle signs is: PREFIX || region (u32 BE) || signal (u32 BE) ||
/// nonce (u64 BE). The Node signer in oracle/ builds the identical bytes.
const EVENT_PAYLOAD_PREFIX: &[u8; 17] = b"CELERITY-EVENT-V1";

/// A single release receipt (one per funder→farmer payment), for the ledger.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Release {
    pub event_id: u64,
    pub pool_id: u64,
    pub funder: Address,
    pub farmer: Address,
    pub amount: i128,
}

/// Per-(pool, farmer) installment bookkeeping for recurring pools.
/// Written by settle_event when the first installment releases; the claim
/// schedule (Phase 4) advances it.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstallmentProgress {
    pub paid: u32,
    pub event_id: u64, // the triggering event, carried onto claim receipts
    pub last_ts: u64,
}

/// Storage keys (doc §6.2 / §10).
#[contracttype]
pub enum DataKey {
    Pool(u64),                  // pool_id -> SubPool
    FarmerReg(Address),         // addr -> Farmer
    Settled(u64, Address, u64), // (event_id, farmer, pool_id) -> bool
    Event(u64),                 // event_id -> Event
    UsedNonce(u64),             // oracle nonce -> bool (replay protection)
    Progress(u64, Address),     // (pool_id, farmer) -> InstallmentProgress
    Ledger(Address),            // funder -> Vec<Release>
    RegionFarmers(u32),         // region -> Vec<Address> of registered farmers
    Token,                      // the settlement asset (SAC) address
    OracleKey,                  // Ed25519 public key authorized to sign events
    Admin,                      // registry admin (LGU/co-op)
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

fn get_oracle(e: &Env) -> BytesN<32> {
    e.storage()
        .instance()
        .get(&DataKey::OracleKey)
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

#[contract]
pub struct Celerity;

// ---------------------------------------------------------------------------
// Contract surface (doc §6.3 / §10)
// ---------------------------------------------------------------------------

#[contractimpl]
impl Celerity {
    /// Runs exactly once, atomically with deployment (no separate init call to
    /// front-run or replay): sets the registry admin, the oracle's Ed25519
    /// public key, and the settlement token (a Stellar Asset Contract address).
    pub fn __constructor(e: Env, admin: Address, oracle: BytesN<32>, token: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::OracleKey, &oracle);
        e.storage().instance().set(&DataKey::Token, &token);
        e.storage().instance().set(&DataKey::NextPoolId, &1u64);
        e.storage().instance().set(&DataKey::NextEventId, &1u64);
    }

    // --- funder -------------------------------------------------------------

    /// Create an earmarked sub-pool, transfer `amount` of the settlement token
    /// from the funder into the contract, and return the new pool_id.
    ///
    /// Note: `amount` and `claim_period_secs` are additions to the doc §6.3
    /// signature — the pool's escrowed balance is independent of `payout`
    /// (the number of farmers a pool will cover is not known at deposit
    /// time), and each funder sets its own installment cadence (rule 2:
    /// funders are independent). `claim_period_secs` is ignored for lump
    /// (installments == 1) pools.
    pub fn deposit(
        e: Env,
        funder: Address,
        amount: i128,
        region: u32,
        threshold: u32,
        payout: i128,
        installments: u32,
        claim_period_secs: u64,
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
                funder,
                balance: amount,
                region,
                signal_threshold: threshold,
                payout_per_farmer: payout,
                installments,
                claim_period_secs,
                status: PoolStatus::Active,
            },
        );
        pool_id
    }

    /// Add funds to an existing sub-pool. Only the pool's funder can top up
    /// (the transfer is drawn from the funder's own account).
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
        // New money cures the flag: Exhausted means "ran dry during settlement",
        // so a refilled pool must rejoin future settlements rather than being
        // silently skipped forever. Paused stays paused — that is the funder's
        // explicit choice, undone only by resume_pool.
        if pool.status == PoolStatus::Exhausted {
            pool.status = PoolStatus::Active;
        }
        save_pool(&e, pool_id, &pool);
    }

    /// Return the entire unspent balance of a sub-pool to its funder.
    /// Funder-auth only: one funder can never touch another's pool.
    pub fn withdraw_unspent(e: Env, pool_id: u64) {
        let mut pool = get_pool(&e, pool_id);
        pool.funder.require_auth();

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
    }

    /// Pause a sub-pool so it is skipped by settlement/claims. Funder-auth only.
    pub fn pause_pool(e: Env, pool_id: u64) {
        let mut pool = get_pool(&e, pool_id);
        pool.funder.require_auth();
        pool.status = PoolStatus::Paused;
        save_pool(&e, pool_id, &pool);
    }

    /// Reactivate a sub-pool the funder previously paused. Funder-auth only.
    /// Strictly Paused -> Active: an Exhausted pool is cured only by new money
    /// (top_up), never by flipping its status.
    pub fn resume_pool(e: Env, pool_id: u64) {
        let mut pool = get_pool(&e, pool_id);
        pool.funder.require_auth();
        if pool.status != PoolStatus::Paused {
            panic_with_error!(&e, Error::PoolNotPaused);
        }
        pool.status = PoolStatus::Active;
        save_pool(&e, pool_id, &pool);
    }

    // --- registry (LGU/co-op admin) ----------------------------------------

    /// Enroll a farmer in a region. Admin-auth only — who is a farmer is a
    /// human (LGU/co-op) decision, never the contract's.
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
        list.push_back(addr);
        e.storage()
            .persistent()
            .set(&DataKey::RegionFarmers(region), &list);
    }

    /// Remove a farmer from the registry. Admin-auth only.
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
    }

    // --- oracle -------------------------------------------------------------

    /// Verify `sig` (Ed25519, from the authorized oracle key) over the event
    /// payload, store the event, and return its event_id. Anyone may relay a
    /// signed event — the signature, not the submitter, is the authority; no
    /// other party can forge one.
    ///
    /// `nonce` is an addition to the doc §6.3 signature: it gives each signed
    /// event a unique identity, and a used nonce is rejected — otherwise
    /// replaying the same oracle signature would mint a fresh event_id and
    /// defeat the Settled(event_id, farmer, pool_id) idempotency key.
    pub fn report_event(e: Env, region: u32, signal: u32, nonce: u64, sig: BytesN<64>) -> u64 {
        // Reconstruct the exact bytes the oracle signed; verification traps
        // on any mismatch of content or key.
        let mut payload = Bytes::from_slice(&e, EVENT_PAYLOAD_PREFIX);
        payload.extend_from_array(&region.to_be_bytes());
        payload.extend_from_array(&signal.to_be_bytes());
        payload.extend_from_array(&nonce.to_be_bytes());
        e.crypto().ed25519_verify(&get_oracle(&e), &payload, &sig);

        if e.storage().persistent().has(&DataKey::UsedNonce(nonce)) {
            panic_with_error!(&e, Error::NonceAlreadyUsed);
        }
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
        event_id
    }

    // --- release / claim ----------------------------------------------------

    /// For each Active sub-pool whose region matches the event and whose
    /// signal_threshold is met (event.signal >= threshold), release
    /// `payout_per_farmer` to each registered farmer in that region — the
    /// first installment for recurring pools. Returns the number of new
    /// releases made.
    ///
    /// Permissionless by design: the signed event is the authority, so anyone
    /// may crank settlement — the caller can neither choose who gets paid nor
    /// how much.
    ///
    /// Idempotent on Settled(event_id, farmer, pool_id): re-running the same
    /// event never double-pays; already-settled (farmer, pool) pairs are
    /// skipped, so a re-run after a top_up pays only whoever was missed.
    ///
    /// Flag, never fail: a pool that cannot cover the next payout is marked
    /// Exhausted and settlement continues with the remaining pools — one
    /// funder's dry pool must never revert another funder's release.
    ///
    /// Scale note: iterates pools (1..NextPoolId) x farmers in the region in
    /// one transaction — fine at demo scale; paginate before real-scale use.
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
                    continue; // this event already paid this farmer from this pool
                }
                if pool.balance < pool.payout_per_farmer {
                    // Flag, never fail: mark and move on to the next pool.
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

    /// Pull the next installment from a recurring sub-pool. Farmer-auth: the
    /// farmer pulls their own schedule, started by settle_event's first
    /// installment. Due when `claim_period_secs` have elapsed since the last
    /// payment; a paused pool blocks the claim; an underfunded pool fails
    /// loudly (top_up cures it — a panic must not persist an Exhausted flag,
    /// since panicking reverts every write).
    pub fn claim(e: Env, farmer: Address, pool_id: u64) {
        farmer.require_auth();
        let mut pool = get_pool(&e, pool_id);
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

    // --- views --------------------------------------------------------------

    /// Read back a sub-pool.
    pub fn pool(e: Env, pool_id: u64) -> SubPool {
        get_pool(&e, pool_id)
    }

    /// Read back a reported weather event.
    pub fn event(e: Env, event_id: u64) -> Event {
        e.storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .unwrap_or_else(|| panic_with_error!(&e, Error::EventNotFound))
    }

    /// Read back a farmer registration.
    pub fn farmer(e: Env, addr: Address) -> Farmer {
        e.storage()
            .persistent()
            .get(&DataKey::FarmerReg(addr))
            .unwrap_or_else(|| panic_with_error!(&e, Error::FarmerNotFound))
    }

    /// All registered farmers in a region (demo/frontend helper).
    pub fn farmers_in_region(e: Env, region: u32) -> Vec<Address> {
        region_farmers(&e, region)
    }

    /// All releases made from a given funder's pools, newest last.
    pub fn funder_ledger(e: Env, funder: Address) -> Vec<Release> {
        e.storage()
            .persistent()
            .get(&DataKey::Ledger(funder))
            .unwrap_or_else(|| Vec::new(&e))
    }
}

mod test;
