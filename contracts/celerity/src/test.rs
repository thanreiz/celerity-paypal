#![cfg(test)]
//! Phase 0 smoke test: the contract registers in a test env and its client
//! type is generated. Real behavioral tests arrive with each phase.

use crate::{Celerity, CelerityClient};
use soroban_sdk::Env;

#[test]
fn contract_registers() {
    let env = Env::default();
    let contract_id = env.register(Celerity, ());
    // Build the generated client to prove the interface compiles.
    let _client = CelerityClient::new(&env, &contract_id);
}
