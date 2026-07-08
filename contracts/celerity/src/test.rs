#![cfg(test)]
//! Phase 1 tests: core escrow (deposit / top_up / withdraw_unspent /
//! pause_pool) and the farmer registry.
//!
//! The adversarial cases matter most (see CLAUDE.md): a funder must never be
//! able to touch another funder's pool, and only the admin may touch the
//! registry. Negative auth tests use `mock_auths` with ONLY the attacker's
//! auth mocked — if a function forgot its `require_auth`, the call would
//! succeed and the test would fail.

use crate::{Celerity, CelerityClient, DataKey, Error, PoolStatus, SubPool};
use soroban_sdk::testutils::{Address as _, AuthorizedFunction, MockAuth, MockAuthInvoke};
use soroban_sdk::xdr::{ScErrorCode, ScErrorType};
use soroban_sdk::{token, Address, BytesN, Env, IntoVal, InvokeError, Symbol};

/// The expected `.err()` of a `try_` call that panicked with `e`.
fn cerr(e: Error) -> Result<soroban_sdk::Error, InvokeError> {
    Ok(soroban_sdk::Error::from_contract_error(e as u32))
}

/// The expected `.err()` of a `try_` call rejected by `require_auth`. The host
/// reports it to the invoking client as Context/InvalidAction; what matters is
/// that it is NOT a contract error, so a failure for any other reason (missing
/// pool, bad args) cannot masquerade as an auth rejection.
fn auth_err() -> Result<soroban_sdk::Error, InvokeError> {
    Ok(soroban_sdk::Error::from_type_and_code(
        ScErrorType::Context,
        ScErrorCode::InvalidAction,
    ))
}

/// Assert that the ROOT of the recorded auth tree is `who` authorizing
/// `fn_name` on the Celerity contract itself — not merely the SAC token
/// transfer sub-call. This is what proves the contract-level `require_auth`
/// exists: the token's own auth would not root at our contract.
fn assert_root_auth(s: &Setup, who: &Address, fn_name: &str) {
    let auths = s.env.auths();
    assert_eq!(&auths[0].0, who);
    match &auths[0].1.function {
        AuthorizedFunction::Contract((addr, name, _)) => {
            assert_eq!(addr, &s.client.address);
            assert_eq!(name, &Symbol::new(&s.env, fn_name));
        }
        _ => panic!("expected a contract-rooted authorization"),
    }
}

const REGION_V: u32 = 5;
const THRESHOLD: u32 = 3;
const PAYOUT: i128 = 100;

struct Setup {
    env: Env,
    client: CelerityClient<'static>,
    token: token::TokenClient<'static>,
    sac: token::StellarAssetClient<'static>,
    admin: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(token_admin);
    let token = token::TokenClient::new(&env, &asset.address());
    let sac = token::StellarAssetClient::new(&env, &asset.address());

    // Constructor args run atomically at deploy — no separate init call.
    let contract_id = env.register(
        Celerity,
        (
            admin.clone(),
            BytesN::from_array(&env, &[0u8; 32]),
            asset.address(),
        ),
    );
    let client = CelerityClient::new(&env, &contract_id);

    Setup {
        env,
        client,
        token,
        sac,
        admin,
    }
}

/// Create a funder with `minted` tokens.
fn funded_addr(s: &Setup, minted: i128) -> Address {
    let addr = Address::generate(&s.env);
    s.sac.mint(&addr, &minted);
    addr
}

// ---------------------------------------------------------------------------
// deposit
// ---------------------------------------------------------------------------

#[test]
fn deposit_creates_earmarked_pool() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);

    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);
    assert_eq!(pool_id, 1);

    // deposit itself (not just the token transfer inside it) demanded the
    // funder's authorization
    assert_root_auth(&s, &funder, "deposit");

    // pool state is exactly what was earmarked
    let pool = s.client.pool(&pool_id);
    assert_eq!(pool.funder, funder);
    assert_eq!(pool.balance, 600);
    assert_eq!(pool.region, REGION_V);
    assert_eq!(pool.signal_threshold, THRESHOLD);
    assert_eq!(pool.payout_per_farmer, PAYOUT);
    assert_eq!(pool.installments, 1);
    assert_eq!(pool.status, PoolStatus::Active);

    // funds actually moved into the contract escrow
    assert_eq!(s.token.balance(&funder), 400);
    assert_eq!(s.token.balance(&s.client.address), 600);
}

#[test]
fn deposit_rejects_invalid_args() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);

    let zero_amount = s
        .client
        .try_deposit(&funder, &0, &REGION_V, &THRESHOLD, &PAYOUT, &1);
    assert_eq!(zero_amount.err(), Some(cerr(Error::InvalidAmount)));

    let neg_amount = s
        .client
        .try_deposit(&funder, &-5, &REGION_V, &THRESHOLD, &PAYOUT, &1);
    assert_eq!(neg_amount.err(), Some(cerr(Error::InvalidAmount)));

    let zero_payout = s
        .client
        .try_deposit(&funder, &600, &REGION_V, &THRESHOLD, &0, &1);
    assert_eq!(zero_payout.err(), Some(cerr(Error::InvalidPayout)));

    let zero_installments = s
        .client
        .try_deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &0);
    assert_eq!(zero_installments.err(), Some(cerr(Error::InvalidInstallments)));
}

#[test]
fn deposit_without_auth_fails() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);

    // No auth mocked at all: the funder never signed, so deposit must fail.
    s.env.mock_auths(&[]);
    let res = s
        .client
        .try_deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);
    assert!(res.is_err());
}

#[test]
fn two_funders_get_independent_pools() {
    let s = setup();
    let alice = funded_addr(&s, 1_000);
    let bob = funded_addr(&s, 1_000);

    let pool_a = s
        .client
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);
    let pool_b = s.client.deposit(&bob, &400, &REGION_V, &4, &200, &2);
    assert_ne!(pool_a, pool_b);

    // Alice withdrawing her own pool must not touch Bob's escrow.
    s.client.withdraw_unspent(&pool_a);
    assert_eq!(s.token.balance(&alice), 1_000);
    assert_eq!(s.client.pool(&pool_a).balance, 0);
    assert_eq!(s.client.pool(&pool_b).balance, 400);
    assert_eq!(s.token.balance(&s.client.address), 400);
}

// ---------------------------------------------------------------------------
// top_up
// ---------------------------------------------------------------------------

#[test]
fn top_up_adds_to_balance() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    s.client.top_up(&pool_id, &250);
    assert_root_auth(&s, &funder, "top_up");

    assert_eq!(s.client.pool(&pool_id).balance, 850);
    assert_eq!(s.token.balance(&funder), 150);
    assert_eq!(s.token.balance(&s.client.address), 850);
}

#[test]
fn top_up_rejects_invalid_amount_and_missing_pool() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    let zero = s.client.try_top_up(&pool_id, &0);
    assert_eq!(zero.err(), Some(cerr(Error::InvalidAmount)));

    let negative = s.client.try_top_up(&pool_id, &-1);
    assert_eq!(negative.err(), Some(cerr(Error::InvalidAmount)));

    let missing = s.client.try_top_up(&999, &100);
    assert_eq!(missing.err(), Some(cerr(Error::PoolNotFound)));

    // balance untouched by all the rejected calls
    assert_eq!(s.client.pool(&pool_id).balance, 600);
}

#[test]
fn stranger_cannot_top_up_anothers_pool() {
    // top_up draws from the pool funder's account, so without the funder's
    // signature it must fail — otherwise Mallory could drain Alice's wallet
    // into escrow.
    let s = setup();
    let alice = funded_addr(&s, 1_000);
    let mallory = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    s.env.mock_auths(&[MockAuth {
        address: &mallory,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "top_up",
            args: (pool_id, 100_i128).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let res = s.client.try_top_up(&pool_id, &100);
    assert_eq!(res.err(), Some(auth_err()));
    assert_eq!(s.token.balance(&alice), 400); // untouched
    assert_eq!(s.client.pool(&pool_id).balance, 600); // untouched
}

#[test]
fn top_up_reactivates_exhausted_pool() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    // Settlement (Phase 3) is what flags Exhausted; simulate its effect by
    // writing the flag directly into contract storage.
    s.env.as_contract(&s.client.address, || {
        let mut pool: SubPool = s
            .env
            .storage()
            .persistent()
            .get(&DataKey::Pool(pool_id))
            .unwrap();
        pool.status = PoolStatus::Exhausted;
        pool.balance = 0;
        s.env
            .storage()
            .persistent()
            .set(&DataKey::Pool(pool_id), &pool);
    });

    s.client.top_up(&pool_id, &300);

    let pool = s.client.pool(&pool_id);
    assert_eq!(pool.status, PoolStatus::Active); // refill cures the flag
    assert_eq!(pool.balance, 300);
}

#[test]
fn top_up_does_not_unpause() {
    // Paused is the funder's explicit choice — money alone must not undo it.
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    s.client.pause_pool(&pool_id);
    s.client.top_up(&pool_id, &100);
    assert_eq!(s.client.pool(&pool_id).status, PoolStatus::Paused);
}

// ---------------------------------------------------------------------------
// withdraw_unspent — the funder-isolation gate test
// ---------------------------------------------------------------------------

#[test]
fn withdraw_unspent_returns_balance_to_funder() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    s.client.withdraw_unspent(&pool_id);
    assert_root_auth(&s, &funder, "withdraw_unspent");

    let pool = s.client.pool(&pool_id);
    assert_eq!(pool.balance, 0);
    assert_eq!(pool.status, PoolStatus::Active); // drained, not flagged
    assert_eq!(s.token.balance(&funder), 1_000);
    assert_eq!(s.token.balance(&s.client.address), 0);

    // withdrawing again is a no-op, not an error (balance already 0)
    s.client.withdraw_unspent(&pool_id);
    assert_eq!(s.token.balance(&funder), 1_000);

    // the pool remains usable: a fresh top_up re-funds it
    s.client.top_up(&pool_id, &200);
    assert_eq!(s.client.pool(&pool_id).balance, 200);
    assert_eq!(s.token.balance(&s.client.address), 200);
}

#[test]
fn paused_pool_still_allows_withdraw() {
    // Pausing stops settlement, not the funder's access to their own money.
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    s.client.pause_pool(&pool_id);
    s.client.withdraw_unspent(&pool_id);

    assert_eq!(s.client.pool(&pool_id).balance, 0);
    assert_eq!(s.token.balance(&funder), 1_000);
}

#[test]
fn withdraw_and_pause_missing_pool_fail_cleanly() {
    let s = setup();
    assert_eq!(
        s.client.try_withdraw_unspent(&999).err(),
        Some(cerr(Error::PoolNotFound))
    );
    assert_eq!(
        s.client.try_pause_pool(&999).err(),
        Some(cerr(Error::PoolNotFound))
    );
    assert_eq!(
        s.client.try_resume_pool(&999).err(),
        Some(cerr(Error::PoolNotFound))
    );
}

#[test]
fn funder_cannot_withdraw_anothers_pool() {
    let s = setup();
    let alice = funded_addr(&s, 1_000);
    let mallory = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    // Only Mallory signs. The pool's funder (Alice) did not authorize, so the
    // call must fail and every balance must be untouched.
    s.env.mock_auths(&[MockAuth {
        address: &mallory,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "withdraw_unspent",
            args: (pool_id,).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let res = s.client.try_withdraw_unspent(&pool_id);
    assert_eq!(res.err(), Some(auth_err()));

    assert_eq!(s.client.pool(&pool_id).balance, 600);
    assert_eq!(s.token.balance(&s.client.address), 600);
    assert_eq!(s.token.balance(&mallory), 1_000);
}

// ---------------------------------------------------------------------------
// pause_pool
// ---------------------------------------------------------------------------

#[test]
fn pause_pool_sets_status_and_resume_reverts_it() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    s.client.pause_pool(&pool_id);
    assert_eq!(s.client.pool(&pool_id).status, PoolStatus::Paused);

    s.client.resume_pool(&pool_id);
    assert_root_auth(&s, &funder, "resume_pool");
    assert_eq!(s.client.pool(&pool_id).status, PoolStatus::Active);
}

#[test]
fn resume_only_works_from_paused() {
    // Active -> resume is an error, and Exhausted is cured only by top_up,
    // never by flipping status (an Active/0 pool would lie on stage).
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let pool_id = s
        .client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    let on_active = s.client.try_resume_pool(&pool_id);
    assert_eq!(on_active.err(), Some(cerr(Error::PoolNotPaused)));

    s.env.as_contract(&s.client.address, || {
        let mut pool: SubPool = s
            .env
            .storage()
            .persistent()
            .get(&DataKey::Pool(pool_id))
            .unwrap();
        pool.status = PoolStatus::Exhausted;
        pool.balance = 0;
        s.env
            .storage()
            .persistent()
            .set(&DataKey::Pool(pool_id), &pool);
    });
    let on_exhausted = s.client.try_resume_pool(&pool_id);
    assert_eq!(on_exhausted.err(), Some(cerr(Error::PoolNotPaused)));
    assert_eq!(s.client.pool(&pool_id).status, PoolStatus::Exhausted);
}

#[test]
fn stranger_cannot_resume_anothers_pool() {
    let s = setup();
    let alice = funded_addr(&s, 1_000);
    let mallory = Address::generate(&s.env);
    let pool_id = s
        .client
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);
    s.client.pause_pool(&pool_id);

    s.env.mock_auths(&[MockAuth {
        address: &mallory,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "resume_pool",
            args: (pool_id,).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let res = s.client.try_resume_pool(&pool_id);
    assert_eq!(res.err(), Some(auth_err()));
    assert_eq!(s.client.pool(&pool_id).status, PoolStatus::Paused);
}

#[test]
fn stranger_cannot_pause_anothers_pool() {
    let s = setup();
    let alice = funded_addr(&s, 1_000);
    let mallory = Address::generate(&s.env);
    let pool_id = s
        .client
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);

    s.env.mock_auths(&[MockAuth {
        address: &mallory,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "pause_pool",
            args: (pool_id,).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let res = s.client.try_pause_pool(&pool_id);
    assert_eq!(res.err(), Some(auth_err()));
    assert_eq!(s.client.pool(&pool_id).status, PoolStatus::Active);
}

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

#[test]
fn register_and_read_back_farmer() {
    let s = setup();
    let farmer_addr = Address::generate(&s.env);

    s.client.register_farmer(&farmer_addr, &REGION_V);

    // registration demanded the admin's authorization on the contract call
    assert_root_auth(&s, &s.admin, "register_farmer");

    let farmer = s.client.farmer(&farmer_addr);
    assert_eq!(farmer.addr, farmer_addr);
    assert_eq!(farmer.region, REGION_V);
    assert_eq!(farmer.registered_by, s.admin);

    let in_region = s.client.farmers_in_region(&REGION_V);
    assert_eq!(in_region.len(), 1);
    assert_eq!(in_region.get(0).unwrap(), farmer_addr);
}

#[test]
fn non_admin_cannot_register_farmer() {
    let s = setup();
    let mallory = Address::generate(&s.env);
    let farmer_addr = Address::generate(&s.env);

    s.env.mock_auths(&[MockAuth {
        address: &mallory,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "register_farmer",
            args: (farmer_addr.clone(), REGION_V).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let res = s.client.try_register_farmer(&farmer_addr, &REGION_V);
    assert_eq!(res.err(), Some(auth_err()));

    // and the registry is untouched
    s.env.mock_all_auths();
    assert_eq!(
        s.client.try_farmer(&farmer_addr).err(),
        Some(cerr(Error::FarmerNotFound))
    );
}

#[test]
fn duplicate_registration_fails() {
    let s = setup();
    let farmer_addr = Address::generate(&s.env);

    s.client.register_farmer(&farmer_addr, &REGION_V);
    let res = s.client.try_register_farmer(&farmer_addr, &REGION_V);
    assert_eq!(res.err(), Some(cerr(Error::FarmerAlreadyRegistered)));

    // no duplicate entry in the region list either
    assert_eq!(s.client.farmers_in_region(&REGION_V).len(), 1);
}

#[test]
fn remove_farmer_clears_registry_and_region_list() {
    let s = setup();
    let farmer_addr = Address::generate(&s.env);

    s.client.register_farmer(&farmer_addr, &REGION_V);
    s.client.remove_farmer(&farmer_addr);

    assert_eq!(
        s.client.try_farmer(&farmer_addr).err(),
        Some(cerr(Error::FarmerNotFound))
    );
    assert_eq!(s.client.farmers_in_region(&REGION_V).len(), 0);

    let res = s.client.try_remove_farmer(&farmer_addr);
    assert_eq!(res.err(), Some(cerr(Error::FarmerNotFound)));
}

#[test]
fn non_admin_cannot_remove_farmer() {
    let s = setup();
    let mallory = Address::generate(&s.env);
    let farmer_addr = Address::generate(&s.env);
    s.client.register_farmer(&farmer_addr, &REGION_V);

    s.env.mock_auths(&[MockAuth {
        address: &mallory,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "remove_farmer",
            args: (farmer_addr.clone(),).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let res = s.client.try_remove_farmer(&farmer_addr);
    assert_eq!(res.err(), Some(auth_err()));

    s.env.mock_all_auths();
    assert_eq!(s.client.farmer(&farmer_addr).addr, farmer_addr);
}

#[test]
fn remove_then_reregister_in_new_region_keeps_lists_consistent() {
    // The lifecycle most likely to corrupt the FarmerReg <-> RegionFarmers
    // pairing: enroll in one region, remove, re-enroll somewhere else.
    let s = setup();
    let farmer_addr = Address::generate(&s.env);
    const REGION_VII: u32 = 7;

    s.client.register_farmer(&farmer_addr, &REGION_V);
    s.client.remove_farmer(&farmer_addr);
    s.client.register_farmer(&farmer_addr, &REGION_VII);

    let farmer = s.client.farmer(&farmer_addr);
    assert_eq!(farmer.region, REGION_VII);

    // no ghost entry in the old region, exactly one in the new
    assert_eq!(s.client.farmers_in_region(&REGION_V).len(), 0);
    let in_new = s.client.farmers_in_region(&REGION_VII);
    assert_eq!(in_new.len(), 1);
    assert_eq!(in_new.get(0).unwrap(), farmer_addr);
}

// ---------------------------------------------------------------------------
// views
// ---------------------------------------------------------------------------

#[test]
fn missing_pool_and_farmer_views_error_cleanly() {
    let s = setup();
    assert_eq!(s.client.try_pool(&42).err(), Some(cerr(Error::PoolNotFound)));
    let nobody = Address::generate(&s.env);
    assert_eq!(
        s.client.try_farmer(&nobody).err(),
        Some(cerr(Error::FarmerNotFound))
    );
}

#[test]
fn funder_ledger_starts_empty() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    s.client
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1);
    assert_eq!(s.client.funder_ledger(&funder).len(), 0);
}
