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
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, BytesN,
    Env, Vec,
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
    pub installments: u32, // 1 = lump, >1 = recurring
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

/// Storage keys (doc §6.2 / §10).
#[contracttype]
pub enum DataKey {
    Pool(u64),                  // pool_id -> SubPool
    FarmerReg(Address),         // addr -> Farmer
    Settled(u64, Address, u64), // (event_id, farmer, pool_id) -> bool
    Event(u64),                 // event_id -> Event
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
    /// Note: `amount` is an addition to the doc §6.3 signature — the pool's
    /// escrowed balance is independent of `payout` (the number of farmers a
    /// pool will cover is not known at deposit time), so it must be explicit.
    pub fn deposit(
        e: Env,
        funder: Address,
        amount: i128,
        region: u32,
        threshold: u32,
        payout: i128,
        installments: u32,
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
    pub fn resume_pool(e: Env, pool_id: u64) {
        let mut pool = get_pool(&e, pool_id);
        pool.funder.require_auth();
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

    /// Verify `sig` against the stored OracleKey (Ed25519) over the event
    /// payload, store the event, and return an event_id. No other party can
    /// forge an event. (Phase 2.)
    ///
    /// Phase 2 design note: the signed payload MUST carry a unique identity
    /// (nonce/timestamp), and the contract must dedupe on the signed content —
    /// otherwise replaying the same oracle signature mints a fresh event_id
    /// and defeats the Settled(event_id, farmer, pool_id) idempotency key.
    pub fn report_event(_e: Env, _region: u32, _signal: u32, _sig: BytesN<64>) -> u64 {
        unimplemented!()
    }

    // --- release / claim ----------------------------------------------------

    /// For each Active sub-pool whose region matches and whose signal_threshold
    /// is met by the event, release `payout_per_farmer` to each registered
    /// farmer in that region. Idempotent on Settled(event_id, farmer, pool_id);
    /// an underfunded pool is flagged Exhausted and skipped, never reverted.
    /// (Phase 3.)
    pub fn settle_event(_e: Env, _event_id: u64) {
        unimplemented!()
    }

    /// Pull the next installment from a recurring sub-pool if it is due, then
    /// advance the schedule. A paused pool blocks the claim. (Phase 4.)
    ///
    /// Phase 4 design note: needs a cadence (period) on SubPool and a
    /// per-(farmer, pool) progress key for installments claimed / next due —
    /// added in Phase 4 alongside this implementation.
    pub fn claim(_e: Env, _farmer: Address, _pool_id: u64) {
        unimplemented!()
    }

    // --- views --------------------------------------------------------------

    /// Read back a sub-pool.
    pub fn pool(e: Env, pool_id: u64) -> SubPool {
        get_pool(&e, pool_id)
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
