#![cfg(test)]
//! Phase 1 tests: core escrow (deposit / top_up / withdraw_unspent /
//! pause_pool) and the farmer registry.
//!
//! The adversarial cases matter most (see PROJECT.md): a funder must never be
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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);
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
        .try_deposit(&funder, &0, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);
    assert_eq!(zero_amount.err(), Some(cerr(Error::InvalidAmount)));

    let neg_amount = s
        .client
        .try_deposit(&funder, &-5, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);
    assert_eq!(neg_amount.err(), Some(cerr(Error::InvalidAmount)));

    let zero_payout = s
        .client
        .try_deposit(&funder, &600, &REGION_V, &THRESHOLD, &0, &1, &0);
    assert_eq!(zero_payout.err(), Some(cerr(Error::InvalidPayout)));

    let zero_installments = s
        .client
        .try_deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &0, &0);
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
        .try_deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);
    assert!(res.is_err());
}

#[test]
fn two_funders_get_independent_pools() {
    let s = setup();
    let alice = funded_addr(&s, 1_000);
    let bob = funded_addr(&s, 1_000);

    let pool_a = s
        .client
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);
    let pool_b = s.client.deposit(&bob, &400, &REGION_V, &4, &200, &2, &100);
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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);
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
        .deposit(&alice, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);

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
        .deposit(&funder, &600, &REGION_V, &THRESHOLD, &PAYOUT, &1, &0);
    assert_eq!(s.client.funder_ledger(&funder).len(), 0);
}

// ---------------------------------------------------------------------------
// report_event — the signed oracle trigger (Phase 2)
// ---------------------------------------------------------------------------

use ed25519_dalek::{Signer as _, SigningKey};

/// Deterministic test oracle. Same seed -> same keypair in every test.
fn oracle_signer() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

/// A `setup()` whose contract trusts our test oracle's public key.
fn setup_with_oracle() -> (Setup, SigningKey) {
    let signer = oracle_signer();
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(token_admin);
    let token = token::TokenClient::new(&env, &asset.address());
    let sac = token::StellarAssetClient::new(&env, &asset.address());

    let contract_id = env.register(
        Celerity,
        (
            admin.clone(),
            BytesN::from_array(&env, &signer.verifying_key().to_bytes()),
            asset.address(),
        ),
    );
    let client = CelerityClient::new(&env, &contract_id);

    (
        Setup {
            env,
            client,
            token,
            sac,
            admin,
        },
        signer,
    )
}

/// The exact byte layout the contract verifies:
/// "CELERITY-EVENT-V1" || region u32 BE || signal u32 BE || nonce u64 BE.
fn event_payload(region: u32, signal: u32, nonce: u64) -> [u8; 33] {
    let mut p = [0u8; 33];
    p[..17].copy_from_slice(b"CELERITY-EVENT-V1");
    p[17..21].copy_from_slice(&region.to_be_bytes());
    p[21..25].copy_from_slice(&signal.to_be_bytes());
    p[25..33].copy_from_slice(&nonce.to_be_bytes());
    p
}

fn sign_event(s: &Setup, signer: &SigningKey, region: u32, signal: u32, nonce: u64) -> BytesN<64> {
    let sig = signer.sign(&event_payload(region, signal, nonce));
    BytesN::from_array(&s.env, &sig.to_bytes())
}

#[test]
fn valid_signed_event_is_accepted_and_stored() {
    let (s, signer) = setup_with_oracle();

    let sig = sign_event(&s, &signer, REGION_V, 4, 1001);
    let event_id = s.client.report_event(&REGION_V, &4, &1001, &sig);
    assert_eq!(event_id, 1);

    let event = s.client.event(&event_id);
    assert_eq!(event.region, REGION_V);
    assert_eq!(event.signal, 4);

    // a second, distinct event gets the next id
    let sig2 = sign_event(&s, &signer, REGION_V, 5, 1002);
    assert_eq!(s.client.report_event(&REGION_V, &5, &1002, &sig2), 2);
}

#[test]
fn tampered_event_is_rejected() {
    let (s, signer) = setup_with_oracle();

    // Signed "signal 4" but submitted as "signal 5": verification must trap.
    let sig = sign_event(&s, &signer, REGION_V, 4, 2001);
    assert!(s.client.try_report_event(&REGION_V, &5, &2001, &sig).is_err());

    // Same for a shifted region or nonce under an otherwise valid signature.
    assert!(s.client.try_report_event(&6, &4, &2001, &sig).is_err());
    assert!(s.client.try_report_event(&REGION_V, &4, &2002, &sig).is_err());

    // and nothing was stored
    assert_eq!(s.client.try_event(&1).err(), Some(cerr(Error::EventNotFound)));
}

#[test]
fn event_from_unauthorized_key_is_rejected() {
    let (s, _signer) = setup_with_oracle();

    // A different key signs a perfectly well-formed payload.
    let intruder = SigningKey::from_bytes(&[9u8; 32]);
    let sig = ed25519_dalek::Signer::sign(&intruder, &event_payload(REGION_V, 4, 3001));
    let sig = BytesN::from_array(&s.env, &sig.to_bytes());

    assert!(s.client.try_report_event(&REGION_V, &4, &3001, &sig).is_err());
}

#[test]
fn replayed_event_is_rejected() {
    let (s, signer) = setup_with_oracle();

    let sig = sign_event(&s, &signer, REGION_V, 4, 4001);
    assert_eq!(s.client.report_event(&REGION_V, &4, &4001, &sig), 1);

    // Submitting the identical signed payload again must NOT mint event 2.
    let replay = s.client.try_report_event(&REGION_V, &4, &4001, &sig);
    assert_eq!(replay.err(), Some(cerr(Error::NonceAlreadyUsed)));
    assert_eq!(s.client.try_event(&2).err(), Some(cerr(Error::EventNotFound)));
}

#[test]
fn missing_event_view_errors_cleanly() {
    let (s, _) = setup_with_oracle();
    assert_eq!(s.client.try_event(&42).err(), Some(cerr(Error::EventNotFound)));
}

// ---------------------------------------------------------------------------
// settle_event — the heart (Phase 3): idempotent, flag-not-fail, per-funder
// ledger. These are the two bugs that lose the hackathon; over-test them.
// ---------------------------------------------------------------------------

use crate::{InstallmentProgress, Release};
use soroban_sdk::testutils::Events as _;

/// Report a validly-signed event through the real oracle path.
fn seed_event(s: &Setup, signer: &SigningKey, region: u32, signal: u32, nonce: u64) -> u64 {
    let sig = sign_event(s, signer, region, signal, nonce);
    s.client.report_event(&region, &signal, &nonce, &sig)
}

#[test]
fn one_event_releases_two_funders_to_one_farmer() {
    // The win condition's core: one signed event, two independently-funded
    // earmarked pools, one registered farmer, separate ledger receipts.
    let (s, signer) = setup_with_oracle();
    let alice = funded_addr(&s, 1_000);
    let bob = funded_addr(&s, 1_000);
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);

    let pool_a = s.client.deposit(&alice, &600, &REGION_V, &3, &100, &1, &0);
    let pool_b = s.client.deposit(&bob, &400, &REGION_V, &4, &50, &1, &0);

    let event_id = seed_event(&s, &signer, REGION_V, 4, 100);
    let released = s.client.settle_event(&event_id);

    // events().all() holds only the last invocation's events — count Celerity's
    // "release" events now, before any further client call clears them.
    let release_events = s
        .env
        .events()
        .all()
        .filter_by_contract(&s.client.address)
        .events()
        .len();
    assert_eq!(release_events, 2);

    assert_eq!(released, 2);
    assert_eq!(s.token.balance(&farmer), 150);
    assert_eq!(s.client.pool(&pool_a).balance, 500);
    assert_eq!(s.client.pool(&pool_b).balance, 350);
    // escrow invariant: holdings == sum of pool balances
    assert_eq!(s.token.balance(&s.client.address), 850);

    // one separate receipt per funder
    let ledger_a = s.client.funder_ledger(&alice);
    let ledger_b = s.client.funder_ledger(&bob);
    assert_eq!(ledger_a.len(), 1);
    assert_eq!(ledger_b.len(), 1);
    assert_eq!(
        ledger_a.get(0).unwrap(),
        Release {
            event_id,
            pool_id: pool_a,
            funder: alice.clone(),
            farmer: farmer.clone(),
            amount: 100
        }
    );
    assert_eq!(ledger_b.get(0).unwrap().amount, 50);
}

#[test]
fn settle_twice_pays_exactly_once() {
    // THE idempotency gate: a re-run must be a no-op, not a double payment.
    let (s, signer) = setup_with_oracle();
    let alice = funded_addr(&s, 1_000);
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);
    let pool_id = s.client.deposit(&alice, &600, &REGION_V, &3, &100, &1, &0);

    let event_id = seed_event(&s, &signer, REGION_V, 4, 200);
    assert_eq!(s.client.settle_event(&event_id), 1);

    let rerun = s.client.settle_event(&event_id);
    assert_eq!(rerun, 0);
    assert_eq!(s.token.balance(&farmer), 100); // not 200
    assert_eq!(s.client.pool(&pool_id).balance, 500); // not 400
    assert_eq!(s.client.funder_ledger(&alice).len(), 1); // no duplicate receipt
}

#[test]
fn dry_pool_flagged_solvent_pools_still_pay() {
    // Flag-not-fail: one underfunded pool must never revert the event.
    let (s, signer) = setup_with_oracle();
    let alice = funded_addr(&s, 1_000);
    let bob = funded_addr(&s, 1_000);
    let carol = funded_addr(&s, 1_000);
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);

    let pool_a = s.client.deposit(&alice, &600, &REGION_V, &3, &100, &1, &0);
    let pool_dry = s.client.deposit(&bob, &30, &REGION_V, &3, &100, &1, &0); // < payout
    let pool_c = s.client.deposit(&carol, &200, &REGION_V, &3, &50, &1, &0);

    let event_id = seed_event(&s, &signer, REGION_V, 4, 300);
    let released = s.client.settle_event(&event_id);

    assert_eq!(released, 2); // A and C paid; dry pool skipped, not reverted
    assert_eq!(s.token.balance(&farmer), 150);
    assert_eq!(s.client.pool(&pool_dry).status, PoolStatus::Exhausted);
    assert_eq!(s.client.pool(&pool_dry).balance, 30); // flagged, money intact
    assert_eq!(s.client.pool(&pool_a).balance, 500);
    assert_eq!(s.client.pool(&pool_c).balance, 150);
    assert_eq!(s.client.funder_ledger(&bob).len(), 0);
}

#[test]
fn three_funders_one_farmer_three_separate_receipts() {
    let (s, signer) = setup_with_oracle();
    let funders: [Address; 3] = [
        funded_addr(&s, 1_000),
        funded_addr(&s, 1_000),
        funded_addr(&s, 1_000),
    ];
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);
    for (i, f) in funders.iter().enumerate() {
        s.client
            .deposit(f, &500, &REGION_V, &3, &(100 + i as i128), &1, &0);
    }

    let event_id = seed_event(&s, &signer, REGION_V, 4, 400);
    assert_eq!(s.client.settle_event(&event_id), 3);
    assert_eq!(s.token.balance(&farmer), 100 + 101 + 102);

    for (i, f) in funders.iter().enumerate() {
        let ledger = s.client.funder_ledger(f);
        assert_eq!(ledger.len(), 1); // each funder sees ONLY its own release
        let r = ledger.get(0).unwrap();
        assert_eq!(r.funder, f.clone());
        assert_eq!(r.amount, 100 + i as i128);
    }
}

#[test]
fn midlist_exhaustion_pays_partial_then_recovers_after_topup() {
    // A pool that runs dry halfway through the farmer list: whoever was paid
    // stays paid, the pool is flagged, and after a top_up the SAME event can
    // be re-settled to pay only the missed farmers.
    let (s, signer) = setup_with_oracle();
    let alice = funded_addr(&s, 1_000);
    let f1 = Address::generate(&s.env);
    let f2 = Address::generate(&s.env);
    s.client.register_farmer(&f1, &REGION_V);
    s.client.register_farmer(&f2, &REGION_V);

    // 150 covers one payout of 100, not two
    let pool_id = s.client.deposit(&alice, &150, &REGION_V, &3, &100, &1, &0);
    let event_id = seed_event(&s, &signer, REGION_V, 4, 500);

    assert_eq!(s.client.settle_event(&event_id), 1);
    assert_eq!(s.token.balance(&f1), 100);
    assert_eq!(s.token.balance(&f2), 0);
    assert_eq!(s.client.pool(&pool_id).status, PoolStatus::Exhausted);
    assert_eq!(s.client.pool(&pool_id).balance, 50);

    // refill cures the flag; re-settling the same event pays ONLY f2
    s.client.top_up(&pool_id, &200);
    assert_eq!(s.client.settle_event(&event_id), 1);
    assert_eq!(s.token.balance(&f1), 100); // idempotent: f1 not paid again
    assert_eq!(s.token.balance(&f2), 100);
    assert_eq!(s.client.pool(&pool_id).balance, 150);
    assert_eq!(s.client.funder_ledger(&alice).len(), 2);
}

#[test]
fn paused_wrong_region_and_high_threshold_pools_are_skipped() {
    let (s, signer) = setup_with_oracle();
    let alice = funded_addr(&s, 2_000);
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);

    let paused = s.client.deposit(&alice, &300, &REGION_V, &3, &100, &1, &0);
    s.client.pause_pool(&paused);
    let wrong_region = s.client.deposit(&alice, &300, &6, &3, &100, &1, &0);
    let too_high = s.client.deposit(&alice, &300, &REGION_V, &5, &100, &1, &0); // thr 5 > signal 4
    let exact = s.client.deposit(&alice, &300, &REGION_V, &4, &100, &1, &0); // thr == signal pays

    let event_id = seed_event(&s, &signer, REGION_V, 4, 600);
    assert_eq!(s.client.settle_event(&event_id), 1); // only `exact`

    assert_eq!(s.token.balance(&farmer), 100);
    assert_eq!(s.client.pool(&paused).balance, 300);
    assert_eq!(s.client.pool(&wrong_region).balance, 300);
    assert_eq!(s.client.pool(&too_high).balance, 300);
    assert_eq!(s.client.pool(&exact).balance, 200);
}

#[test]
fn settle_unknown_event_and_empty_region_are_safe() {
    let (s, signer) = setup_with_oracle();
    let alice = funded_addr(&s, 1_000);
    s.client.deposit(&alice, &600, &REGION_V, &3, &100, &1, &0);

    // unknown event id -> clean error
    assert_eq!(
        s.client.try_settle_event(&99).err(),
        Some(cerr(Error::EventNotFound))
    );

    // event over a region with no registered farmers -> 0 releases, no flag
    let event_id = seed_event(&s, &signer, REGION_V, 4, 700);
    assert_eq!(s.client.settle_event(&event_id), 0);
    assert_eq!(s.client.pool(&1).status, PoolStatus::Active);
}

// ---------------------------------------------------------------------------
// claim — recurring installment pull (Phase 4)
// ---------------------------------------------------------------------------

use soroban_sdk::testutils::Ledger as _;

const PERIOD: u64 = 100;

/// Recurring-pool fixture: 3 installments of 100 every PERIOD secs, settled
/// once (installment 1 paid at t0). Returns (setup, farmer, pool_id, t0).
fn settled_recurring_pool() -> (Setup, Address, u64, u64) {
    let (s, signer) = setup_with_oracle();
    let t0 = 1_000_000;
    s.env.ledger().with_mut(|l| l.timestamp = t0);

    let alice = funded_addr(&s, 1_000);
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);
    let pool_id = s
        .client
        .deposit(&alice, &600, &REGION_V, &3, &100, &3, &PERIOD);
    let event_id = seed_event(&s, &signer, REGION_V, 4, 900);
    assert_eq!(s.client.settle_event(&event_id), 1); // installment 1
    (s, farmer, pool_id, t0)
}

#[test]
fn two_installments_claimed_in_sequence_on_schedule() {
    let (s, farmer, pool_id, t0) = settled_recurring_pool();
    let funder = s.client.pool(&pool_id).funder;
    assert_eq!(s.token.balance(&farmer), 100); // installment 1 from settle

    s.env.ledger().with_mut(|l| l.timestamp = t0 + PERIOD);
    s.client.claim(&farmer, &pool_id);
    assert_root_auth(&s, &farmer, "claim"); // the farmer's own pull
    assert_eq!(s.token.balance(&farmer), 200);

    s.env.ledger().with_mut(|l| l.timestamp = t0 + 2 * PERIOD);
    s.client.claim(&farmer, &pool_id);
    assert_eq!(s.token.balance(&farmer), 300);
    assert_eq!(s.client.pool(&pool_id).balance, 300);

    // 3 receipts on the funder's ledger, all tied to the original event
    let ledger = s.client.funder_ledger(&funder);
    assert_eq!(ledger.len(), 3);
    for r in ledger.iter() {
        assert_eq!(r.event_id, 1);
        assert_eq!(r.amount, 100);
    }
}

#[test]
fn claim_before_due_fails() {
    let (s, farmer, pool_id, t0) = settled_recurring_pool();

    // immediately after settlement
    let early = s.client.try_claim(&farmer, &pool_id);
    assert_eq!(early.err(), Some(cerr(Error::ClaimNotDueYet)));

    // one second before due
    s.env.ledger().with_mut(|l| l.timestamp = t0 + PERIOD - 1);
    let still_early = s.client.try_claim(&farmer, &pool_id);
    assert_eq!(still_early.err(), Some(cerr(Error::ClaimNotDueYet)));

    assert_eq!(s.token.balance(&farmer), 100); // nothing moved
    assert_eq!(s.client.pool(&pool_id).balance, 500);
}

#[test]
fn paused_pool_blocks_claim_and_resume_unblocks() {
    let (s, farmer, pool_id, t0) = settled_recurring_pool();
    s.env.ledger().with_mut(|l| l.timestamp = t0 + PERIOD);

    s.client.pause_pool(&pool_id);
    let blocked = s.client.try_claim(&farmer, &pool_id);
    assert_eq!(blocked.err(), Some(cerr(Error::PoolPaused)));
    assert_eq!(s.token.balance(&farmer), 100);

    s.client.resume_pool(&pool_id);
    s.client.claim(&farmer, &pool_id);
    assert_eq!(s.token.balance(&farmer), 200);
}

#[test]
fn claim_stops_after_last_installment_and_schedule_advances() {
    let (s, farmer, pool_id, t0) = settled_recurring_pool();

    s.env.ledger().with_mut(|l| l.timestamp = t0 + PERIOD);
    s.client.claim(&farmer, &pool_id); // installment 2

    // claiming again in the same window fails — the schedule advanced
    let same_window = s.client.try_claim(&farmer, &pool_id);
    assert_eq!(same_window.err(), Some(cerr(Error::ClaimNotDueYet)));

    s.env.ledger().with_mut(|l| l.timestamp = t0 + 2 * PERIOD);
    s.client.claim(&farmer, &pool_id); // installment 3 (last)

    // no fourth installment, ever
    s.env.ledger().with_mut(|l| l.timestamp = t0 + 10 * PERIOD);
    let done = s.client.try_claim(&farmer, &pool_id);
    assert_eq!(done.err(), Some(cerr(Error::AllInstallmentsPaid)));
    assert_eq!(s.token.balance(&farmer), 300);
}

#[test]
fn claim_without_settlement_or_registration_fails() {
    let (s, signer) = setup_with_oracle();
    let alice = funded_addr(&s, 2_000);
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);
    let lump = s.client.deposit(&alice, &600, &REGION_V, &3, &100, &1, &0);
    let recurring = s
        .client
        .deposit(&alice, &600, &REGION_V, &3, &100, &3, &PERIOD);

    // no settlement has happened at all -> no schedule to pull from
    assert_eq!(
        s.client.try_claim(&farmer, &recurring).err(),
        Some(cerr(Error::NothingToClaim))
    );

    // a lump pool never has a claim schedule, even after settlement
    let event_id = seed_event(&s, &signer, REGION_V, 4, 901);
    s.client.settle_event(&event_id);
    assert_eq!(
        s.client.try_claim(&farmer, &lump).err(),
        Some(cerr(Error::NothingToClaim))
    );

    // a stranger who was never registered is rejected at the registry gate
    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.client.try_claim(&stranger, &recurring).err(),
        Some(cerr(Error::FarmerNotFound))
    );
}

#[test]
fn removed_farmer_cannot_claim_remaining_installments() {
    let (s, farmer, pool_id, t0) = settled_recurring_pool();
    s.env.ledger().with_mut(|l| l.timestamp = t0 + PERIOD);

    s.client.remove_farmer(&farmer);
    assert_eq!(
        s.client.try_claim(&farmer, &pool_id).err(),
        Some(cerr(Error::FarmerNotFound))
    );
    // first installment from settle still sits with them; no further pulls
    assert_eq!(s.token.balance(&farmer), 100);
}

#[test]
fn second_event_defers_while_recurring_schedule_active() {
    // A later typhoon must not overwrite Progress and inflate payouts beyond
    // `installments`. Settle of event 2 is a no-op until the schedule finishes,
    // then a re-settle starts a fresh schedule.
    let (s, signer) = setup_with_oracle();
    let t0 = 2_000_000;
    s.env.ledger().with_mut(|l| l.timestamp = t0);

    let alice = funded_addr(&s, 2_000);
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);
    let pool_id = s
        .client
        .deposit(&alice, &1_000, &REGION_V, &3, &100, &3, &PERIOD);

    let event_1 = seed_event(&s, &signer, REGION_V, 4, 910);
    assert_eq!(s.client.settle_event(&event_1), 1);
    assert_eq!(s.token.balance(&farmer), 100);

    let event_2 = seed_event(&s, &signer, REGION_V, 4, 911);
    assert_eq!(s.client.settle_event(&event_2), 0); // deferred — schedule active
    assert_eq!(s.token.balance(&farmer), 100); // no extra payout

    let progress: InstallmentProgress = s.env.as_contract(&s.client.address, || {
        s.env
            .storage()
            .persistent()
            .get(&DataKey::Progress(pool_id, farmer.clone()))
            .unwrap()
    });
    assert_eq!(progress.paid, 1);
    assert_eq!(progress.event_id, event_1); // not overwritten by event_2

    // finish the schedule
    s.env.ledger().with_mut(|l| l.timestamp = t0 + PERIOD);
    s.client.claim(&farmer, &pool_id);
    s.env.ledger().with_mut(|l| l.timestamp = t0 + 2 * PERIOD);
    s.client.claim(&farmer, &pool_id);
    assert_eq!(s.token.balance(&farmer), 300);

    // now event_2 can open a fresh schedule
    assert_eq!(s.client.settle_event(&event_2), 1);
    assert_eq!(s.token.balance(&farmer), 400);
    let progress2: InstallmentProgress = s.env.as_contract(&s.client.address, || {
        s.env
            .storage()
            .persistent()
            .get(&DataKey::Progress(pool_id, farmer.clone()))
            .unwrap()
    });
    assert_eq!(progress2.paid, 1);
    assert_eq!(progress2.event_id, event_2);
}

#[test]
fn claim_requires_the_farmers_own_auth() {
    let (s, farmer, pool_id, t0) = settled_recurring_pool();
    s.env.ledger().with_mut(|l| l.timestamp = t0 + PERIOD);

    let mallory = Address::generate(&s.env);
    s.env.mock_auths(&[MockAuth {
        address: &mallory,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "claim",
            args: (farmer.clone(), pool_id).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let res = s.client.try_claim(&farmer, &pool_id);
    assert_eq!(res.err(), Some(auth_err()));

    s.env.mock_all_auths();
    assert_eq!(s.token.balance(&farmer), 100); // untouched
}

#[test]
fn underfunded_claim_fails_and_topup_cures_it() {
    let (s, farmer, pool_id, t0) = settled_recurring_pool();
    let funder = s.client.pool(&pool_id).funder;

    // drain the pool down below one payout (funder's prerogative)
    s.client.withdraw_unspent(&pool_id);
    s.env.ledger().with_mut(|l| l.timestamp = t0 + PERIOD);

    let dry = s.client.try_claim(&farmer, &pool_id);
    assert_eq!(dry.err(), Some(cerr(Error::PoolUnderfunded)));

    s.sac.mint(&funder, &100);
    s.client.top_up(&pool_id, &100);
    s.client.claim(&farmer, &pool_id);
    assert_eq!(s.token.balance(&farmer), 200);
}

#[test]
fn recurring_deposit_requires_nonzero_period() {
    let s = setup();
    let funder = funded_addr(&s, 1_000);
    let res = s
        .client
        .try_deposit(&funder, &600, &REGION_V, &3, &100, &3, &0);
    assert_eq!(res.err(), Some(cerr(Error::InvalidPeriod)));
}

#[test]
fn recurring_pool_releases_first_installment_and_records_progress() {
    let (s, signer) = setup_with_oracle();
    let alice = funded_addr(&s, 1_000);
    let farmer = Address::generate(&s.env);
    s.client.register_farmer(&farmer, &REGION_V);

    // 3 installments of 100
    let pool_id = s.client.deposit(&alice, &600, &REGION_V, &3, &100, &3, &100);
    let event_id = seed_event(&s, &signer, REGION_V, 4, 800);

    assert_eq!(s.client.settle_event(&event_id), 1);
    assert_eq!(s.token.balance(&farmer), 100); // first installment only
    assert_eq!(s.client.pool(&pool_id).balance, 500);

    // progress recorded for the claim schedule (Phase 4)
    let progress: InstallmentProgress = s.env.as_contract(&s.client.address, || {
        s.env
            .storage()
            .persistent()
            .get(&DataKey::Progress(pool_id, farmer.clone()))
            .unwrap()
    });
    assert_eq!(progress.paid, 1);
}
