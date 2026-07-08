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
oracle/                 Node.js Ed25519 oracle signer (demo stub for PAGASA/JMA feed)
qa-reports/             On-chain QA sweeps per phase
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

# Deploy to Testnet (returns a contract ID; recorded in deployments.json).
# The constructor runs atomically at deploy: admin, oracle Ed25519 pubkey
# (hex), and the settlement token (SAC address) are set with no separate
# init call to front-run.
stellar contract deploy \
  --wasm target/wasm32v1-none/release/celerity.wasm \
  --source-account alice \
  --network testnet \
  --alias celerity \
  -- \
  --admin "$(stellar keys address alice)" \
  --oracle <64-hex-char Ed25519 pubkey> \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC

# Inspect the deployed interface
stellar contract info interface --network testnet --id <CONTRACT_ID>
```

## Current status

**Phase 2 complete** — signed oracle events live on Testnet
(`CAL64YFBWUAE4OXLA3ZYSEQ7WZW73DPHDLPHW4F4AVEJ2TMPAJ5GAWZ7`):

- `report_event(region, signal, nonce, sig)` verifies the oracle's Ed25519
  signature over `"CELERITY-EVENT-V1" || region || signal || nonce` and
  rejects any reused nonce — a captured signature cannot be replayed into a
  second event. Anyone may relay a signed event; nobody can forge one.
- Node.js signer in `oracle/` produces contract-accepted signatures end to
  end; the signing key is generated into gitignored `.env`, never committed.
- Verified on-chain: valid event accepted (id 1), tampered payload rejected,
  replay rejected, wrong-key event rejected. 30/30 local tests.

**Phase 1** — core escrow + registry, QA'd 24/24 on-chain
(see `qa-reports/2026-07-09-phase0-1.md`).

- `deposit` / `top_up` / `withdraw_unspent` / `pause_pool` / `resume_pool` —
  earmarked per-funder sub-pools holding real escrow (native XLM SAC);
  funder-auth enforced, verified on-chain (a second account cannot withdraw,
  top up, or pause another funder's pool).
- `register_farmer` / `remove_farmer` — admin-only registry with per-region
  farmer lists; verified on-chain.
- 24 unit tests incl. adversarial: cross-funder isolation, non-admin registry
  calls, remove/re-register lifecycle, exhausted-pool refill.
- Constructor (not `init`) sets admin/oracle/token atomically at deploy.

`report_event` (Phase 2), `settle_event` (Phase 3), and `claim` (Phase 4)
remain labeled stubs. The oracle key on the current deployment is a
placeholder; the real Ed25519 key ships with the Phase 2 redeploy.
