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
//! idempotent on a composite settled-key. This file is the Phase 0 skeleton:
//! every function exists with its signature; bodies are stubs.

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Vec};

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
    Regions,                    // Vec<u32> of regions that have registered farmers
    RegionFarmers(u32),         // region -> Vec<Address> of registered farmers
    Token,                      // the settlement asset (SAC) address
    OracleKey,                  // Ed25519 public key authorized to sign events
    Admin,                      // registry admin (LGU/co-op)
    NextPoolId,
    NextEventId,
}

#[contract]
pub struct Celerity;

// ---------------------------------------------------------------------------
// Contract surface (doc §6.3 / §10). Phase 0: signatures only, bodies stubbed.
// ---------------------------------------------------------------------------

#[contractimpl]
impl Celerity {
    /// One-time init: set the registry admin, the oracle's Ed25519 public key,
    /// and the settlement token (a Stellar Asset Contract address).
    pub fn init(_e: Env, _admin: Address, _oracle: BytesN<32>, _token: Address) {
        unimplemented!()
    }

    // --- funder -------------------------------------------------------------

    /// Create an earmarked sub-pool, transfer `payout * ...` funds into the
    /// contract, and return the new pool_id. Funder-auth required.
    pub fn deposit(
        _e: Env,
        _funder: Address,
        _region: u32,
        _threshold: u32,
        _payout: i128,
        _installments: u32,
    ) -> u64 {
        unimplemented!()
    }

    /// Add funds to an existing sub-pool. Funder-auth required.
    pub fn top_up(_e: Env, _pool_id: u64, _amount: i128) {
        unimplemented!()
    }

    /// Return the unspent balance of a sub-pool to its funder. Funder-auth only.
    pub fn withdraw_unspent(_e: Env, _pool_id: u64) {
        unimplemented!()
    }

    /// Pause a sub-pool so it is skipped by settlement/claims. Funder-auth only.
    pub fn pause_pool(_e: Env, _pool_id: u64) {
        unimplemented!()
    }

    // --- registry (LGU/co-op admin) ----------------------------------------

    /// Enroll a farmer in a region. Admin-auth only.
    pub fn register_farmer(_e: Env, _addr: Address, _region: u32) {
        unimplemented!()
    }

    /// Remove a farmer from the registry. Admin-auth only.
    pub fn remove_farmer(_e: Env, _addr: Address) {
        unimplemented!()
    }

    // --- oracle -------------------------------------------------------------

    /// Verify `sig` against the stored OracleKey (Ed25519) over the event
    /// payload, store the event, and return an event_id. No other party can
    /// forge an event.
    pub fn report_event(_e: Env, _region: u32, _signal: u32, _sig: BytesN<64>) -> u64 {
        unimplemented!()
    }

    // --- release / claim ----------------------------------------------------

    /// For each Active sub-pool whose region matches and whose signal_threshold
    /// is met by the event, release `payout_per_farmer` to each registered
    /// farmer in that region. Idempotent on Settled(event_id, farmer, pool_id):
    /// a re-run never double-pays. An underfunded pool is flagged (Exhausted)
    /// and skipped; the event never reverts.
    pub fn settle_event(_e: Env, _event_id: u64) {
        unimplemented!()
    }

    /// Pull the next installment from a recurring sub-pool if it is due, then
    /// advance the schedule. A paused pool blocks the claim.
    pub fn claim(_e: Env, _farmer: Address, _pool_id: u64) {
        unimplemented!()
    }

    // --- views --------------------------------------------------------------

    /// Read back a sub-pool.
    pub fn pool(_e: Env, _pool_id: u64) -> SubPool {
        unimplemented!()
    }

    /// Read back a farmer registration.
    pub fn farmer(_e: Env, _addr: Address) -> Farmer {
        unimplemented!()
    }

    /// All releases made from a given funder's pools, newest last.
    pub fn funder_ledger(_e: Env, _funder: Address) -> Vec<Release> {
        unimplemented!()
    }
}

mod test;
