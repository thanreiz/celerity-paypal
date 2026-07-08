# Celerity

A programmable disaster-disbursement rail on Stellar. Funders deposit into a
shared on-chain escrow, each with an earmarked sub-pool and its own release
rule. An objective, signed weather event (a typhoon signal from an authorized
oracle key) triggers automatic release to pre-registered farmers, which cashes
out to PHP via a Stellar anchor. Every release is logged per funder.

See [`CLAUDE.md`](CLAUDE.md) for the design rules and win condition,
[`Celerity_Hackathon_Doc.md`](Celerity_Hackathon_Doc.md) for the full spec, and
[`Celerity_Build_Phases.md`](Celerity_Build_Phases.md) for the phased build plan.

## Repo layout

```
contracts/celerity/     Soroban smart contract (Rust)
  src/lib.rs            Data model + function surface
  src/test.rs          Unit / adversarial tests
deployments.json        Public Testnet deployment metadata (contract ID, wasm hash)
```

## Prerequisites

- Rust ≥ 1.84 with the `wasm32v1-none` target (`rustup target add wasm32v1-none`)
- Stellar CLI (`cargo install stellar-cli`) — this repo used v27
- A funded Testnet identity named `alice`
  (`stellar keys generate alice --network testnet --fund`)

## Build, test, deploy

```bash
# Build the contract to Wasm
cargo build --target wasm32v1-none --release

# Run tests
cargo test

# Deploy to Testnet (returns a contract ID; recorded in deployments.json)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/celerity.wasm \
  --source-account alice \
  --network testnet \
  --alias celerity

# Inspect the deployed interface
stellar contract info interface --network testnet --id <CONTRACT_ID>
```

## Current status

**Phase 0 complete** — environment set up, contract skeleton with the full
function surface builds to Wasm and is deployed to Testnet
(`CCNGY2SDMTXYTXU57EK37NBR4D7M43LVV4HF632BIALIJ2ZRISUVWIMX`). All bodies are
`unimplemented!()` stubs; implementation begins in Phase 1.
