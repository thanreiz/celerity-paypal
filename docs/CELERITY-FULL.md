# Celerity — Full Technical Reference

> **Relief that moves.**  
> A programmable disaster-disbursement rail on Stellar Soroban.

---

## Table of Contents

1. [What It Is](#what-it-is)
2. [Problem Statement](#problem-statement)
3. [Solution Overview](#solution-overview)
4. [Architecture](#architecture)
5. [Smart Contract](#smart-contract)
6. [Frontend](#frontend)
7. [Oracle Signer](#oracle-signer)
8. [API Layer (Serverless)](#api-layer-serverless)
9. [Stellar Integrations](#stellar-integrations)
10. [Data Model](#data-model)
11. [Contract Function Surface](#contract-function-surface)
12. [Error Codes](#error-codes)
13. [On-Chain Events](#on-chain-events)
14. [Farmer Flow](#farmer-flow)
15. [Funder Flow](#funder-flow)
16. [Demo Slate](#demo-slate)
17. [Environment Variables](#environment-variables)
18. [Build & Deploy](#build--deploy)
19. [Test Suite](#test-suite)
20. [Deployment History](#deployment-history)
21. [Honest Stubs](#honest-stubs)
22. [Design Rules](#design-rules)
23. [Repo Layout](#repo-layout)
24. [Links](#links)

---

## What It Is

Celerity is a **multi-funder, cross-border disaster-disbursement rail** on Stellar. It is **not** a crop insurer, not a faster claims processor. It is the settlement layer *underneath* them — the infrastructure that takes money that already exists in relief funds and gets it to farmers' hands within minutes of a typhoon signal, without an agency intermediary.

**Core claim:** a national insurer (PCIC), a regional multilateral fund (ADB APDRF), and a foreign foundation can co-fund the same typhoon trigger, pay a farmer instant spendable pesos, with no agency hand-off and every peso auditable on-chain.

**Live on Testnet:** [stellar-celerity.me](https://stellar-celerity.me/)  
**Contract:** `CDBLJQOTCGQREBJFLRIS73AZECOX7HINQMA22ZDBSLFE7LWMU2ONC5Z3`

---

## Problem Statement

When a typhoon destroys a farmer's crop, the money to help usually *already exists* — in a national crop-insurance fund, a regional disaster pool, or an NGO earmark. What is slow and lossy is the last mile.

| Pain point | Cost |
|---|---|
| Payouts as physical checks at regional offices | Farmers wait weeks after approval |
| Single-funder, peso-only insurers | Foreign USD disaster capital can't reach a farmer directly |
| No disbursement audit trail | Money routes through agencies with no verifiability |
| Uninsured / unregistered farmers | No fast path at all |

The root cause: turning existing money into cash in a farmer's hands requires layers of intermediaries. Celerity collapses that into one flow: **fund → trigger → pay**.

---

## Solution Overview

1. **Funders deposit** into a shared Soroban escrow. Each deposit is an earmarked sub-pool with its own balance, region, signal threshold, payout amount, and installment schedule. Balances never commingle.
2. **An LGU/co-op admin registers farmers** on-chain. The contract pays only registered addresses in the triggered region — it doesn't decide who's a farmer, it pays a verified list.
3. **Authorized oracles submit a threshold-signed weather bulletin.** `report_event` verifies a **2-of-3 Ed25519 threshold** against constructor-pinned keys. The contract compares numbers (region code, signal level) — it never reads a document.
4. **`settle_event` releases every matching sub-pool at once.** Idempotent on `(event_id, farmer, pool_id)` — replay never double-pays. "Flag-not-fail" — a dry pool is marked `Exhausted` and skipped, not reverted.
5. **Recurring installments.** `claim` releases the next tranche on the pool's cadence; a farmer's current registry region must match the pool's region.
6. **Anchor cash-out.** Released XLM (standing in for a USD stablecoin) routes through a SEP-31 mock anchor to PHP (₱57.5 per unit at the demo rate).

---

## Architecture

```
Funders (ADB APDRF, PCIC, NGOs)
  └─ deposit() ──────────────────────────────── Soroban escrow: earmarked sub-pools
                                                    │
LGU / co-op admin                                   │
  └─ register_farmer() ─────────────────────── Farmer registry (region-keyed)
                                                    │
PAGASA / JMA signal                                 │
  └─ Oracle signer (Ed25519 demo stub)              │
       └─ report_event(region, signal, nonce, sigs) ┤
                                                    │
                                              Celerity contract
                                                    │
                                              settle_event()
                                                    │
                               ┌────────────────────┘
                               │
                        Release to farmers
                               ├─ Per-funder ledger + release events (on-chain)
                               └─ SEP-31 anchor stub → PHP
                                         └─ Farmer: spendable pesos
```

### Layered view

| Layer | Technology | Notes |
|---|---|---|
| Smart contract | Soroban (Rust) on Stellar Testnet | All escrow, trigger, settlement logic |
| Frontend | React 18 + Vite 6 | Two apps: farmer (mobile) + funder (desktop) |
| API / signing | Vercel serverless (Node.js) | Secrets stay server-side; browser never holds a key |
| Oracle signer | Node.js Ed25519 | Demo stub for PAGASA/JMA/NDRRMC |
| Settlement token | Native XLM SAC | Stands in for a USD stablecoin on Testnet |
| Anchor | SEP-31 stub | PHP conversion; live shape, mock receiver |
| Network | Stellar Testnet | All on-chain steps verifiable on stellar.expert |

---

## Smart Contract

**Location:** `contracts/celerity/src/lib.rs`  
**Language:** Rust, compiled to WASM via `wasm32v1-none`  
**Framework:** Soroban SDK  
**Tests:** `contracts/celerity/src/test.rs` — 57 tests, all passing

### Key design invariants (enforced in contract code)

- **No document reading.** The contract takes `region: u32`, `signal: u32`, `nonce: u64`, and `sigs: Vec<OracleSig>`. It verifies cryptographic signatures and compares integers. No text parsing.
- **Funder isolation.** Each `SubPool` is independently authorized by its `funder` address. One funder's `pause_pool`, `withdraw_unspent`, or exhaustion never touches another's pool.
- **Flag-not-fail.** `settle_event` marks an underfunded pool `Exhausted` and continues releasing solvent pools. The event never reverts globally.
- **Idempotent releases.** `Settled(event_id, farmer, pool_id)` composite key prevents double-payment even if `settle_event` is called multiple times (e.g., after a `top_up`).
- **Ledger-timestamped scheduling.** `claim` cooldowns use `e.ledger().timestamp()`, not a client clock. A farmer can't game the cadence.
- **Atomic constructor.** Admin, oracle keys, threshold, and settlement token are set in `__constructor` — no separate init call to front-run.

---

## Frontend

**Location:** `celerity-web/`  
**Stack:** React 18, Vite 6, `@stellar/stellar-sdk` ≥ 16, custom design tokens

Two separate app experiences share one codebase:

### Farmer App (`src/pages/farmer/`)

Mobile-first, brand-first. Demo farmers: **Mang Ramon** (Bicol) and **Aling Nena** (Eastern Visayas).

| Screen | Description |
|---|---|
| `SplashScreen` | Dove logo + "Relief that moves." tagline, loading state |
| `ConnectScreen` | "Is this you?" — farmer name, full region label, optional account reveal, multi-farmer switcher for demo |
| `HomeScreen` | Wallet total (PHP), quick-actions (Cash Out, Help), transaction feed |
| `ActivityScreen` | Full transaction history with receipt rows |
| `DetailScreen` | Pool detail — relief programs, installment status, region-scoped programs only |
| `TxDetailScreen` | Single transaction detail with stellar.expert link |
| `CashOutFlow` | 5-step SEP-31 anchor stub: destination → recipient → amount → confirm → success |
| `ProfileScreen` | Account info, region, registry source |

### Funder Console (`src/pages/funder/`)

Desktop, institution-grade. Two demo funders: **ADB APDRF** (USD) and **PCIC** (PHP).

| Screen | Description |
|---|---|
| `LoginScreen` | GCash-style institution picker |
| `FunderHome` | Escrow hero (total locked, released), circular quick-actions, release feed grouped by signed event |
| `PoolsPage` | Island-grouped pools (Luzon / Visayas / Mindanao), status pills, plain-language rules, typhoon banner |
| `CreatePoolModal` | Create a new sub-pool with region, signal threshold, payout, installments, claim period |
| `TopUpModal` | Add balance to an existing pool, auto-cures `Exhausted` status |
| `FarmersPage` | Registry view (read-only for funders); LGU mode signs with admin key |
| `OraclePage` | Drop a PAGASA-style JSON bulletin → region-by-region preview of what will settle vs. skip → settle |
| `LedgerPage` | Per-funder release history keyed to the logged-in funder |
| `SettingsPage` | Oracle config, contract address, network details |

### Public Transparency Ledger (`src/pages/transparency/`)

No login. Shows all releases across all funders. Every entry links to stellar.expert.

### Design System (`src/design/`)

Custom component library with CSS design tokens.

| Component | Purpose |
|---|---|
| `Button` | Primary / secondary / ghost / danger variants |
| `Card` | Surface container |
| `Badge` / `StatusPill` | Pool status (Active / Paused / Exhausted) |
| `Input` / `Select` | Form controls |
| `TopBar` / `SideNav` / `BottomNav` | Navigation shells |
| `Table` | Ledger / registry tables |
| `Toast` | Ephemeral notifications |
| `CoachTour` | Funder onboarding tour (highlight + tooltip overlay) |
| `CountUp` | Animated number display |
| `MoneyAmount` | PHP / USD / XLM formatted amounts |
| `IconBadge` / `IconRow` | Icon + label rows |
| `RuleSentence` | Plain-language pool rule renderer |
| `Avatar` | Institution initials avatar |
| `Switch` | Toggle control |

---

## Oracle Signer

**Location:** `oracle/`  
**Stack:** Node.js, `@noble/ed25519`

Simulates PAGASA / JMA / NDRRMC. Signs `CELERITY-EVENT-V1 || region (4B BE) || signal (4B BE) || nonce (8B BE)` with Ed25519.

**Demo slate uses 2-of-3:** keys from `ORACLE_SECRET` (index 0), `ORACLE_SECRET_2` (index 1), optionally `ORACLE_SECRET_3` (index 2). The contract enforces threshold ≥ 2.

Key files:
- `generate-key.js` — generate a new Ed25519 keypair
- `sign-event.js` — sign a single event (CLI helper)
- `sample-bulletin.json` — example PAGASA-style multi-region bulletin

---

## API Layer (Serverless)

**Location:** `celerity-web/api/`  
**Deployed on:** Vercel (serverless functions)  
**Dev:** Vite custom plugin re-routes `/api/*` to the same handlers

Secrets never touch the browser. All state-changing contract calls and oracle signing happen server-side.

| Endpoint | Handler | Purpose |
|---|---|---|
| `POST /api/invoke` | `invoke.js` | Call any allowed contract method as a named role |
| `POST /api/oracle-sign` | `oracle-sign.js` | Sign `region + signal + nonce` with oracle key(s) |
| `GET /api/addresses` | `addresses.js` | Return public keys for all demo roles |

### Allowed contract methods (allowlist in `stellar.js`)

`deposit`, `top_up`, `withdraw_unspent`, `pause_pool`, `resume_pool`, `register_farmer`, `remove_farmer`, `report_event`, `settle_event`, `claim`, `set_admin`

### Role → secret mapping

| Role | Env var | Identity |
|---|---|---|
| `funder` | `FUNDER_SECRET` | ADB APDRF (also `admin` in demo) |
| `funder2` | `FUNDER2_SECRET` | PCIC |
| `farmer` | `FARMER_SECRET` | Mang Ramon |
| `farmer2` | `FARMER2_SECRET` | Aling Nena |
| `oracle` | `ORACLE_SECRET` | Oracle key index 0 (signing only, no invoke) |
| `admin` | `FUNDER_SECRET` | Alice (same as funder in demo) |

---

## Stellar Integrations

All of the following except #8 are live, unmocked infrastructure on Stellar Testnet.

| # | Integration | Implementation |
|---|---|---|
| 1 | Soroban smart contract | Full escrow, trigger, and settlement logic in Rust on Stellar |
| 2 | SAC transfers | `token::TokenClient::new(&e, &get_token(&e)).transfer(...)` — native Stellar asset transfers |
| 3 | On-chain multi-sig Ed25519 | `report_event` verifies N of M `ed25519_verify` calls against constructor-pinned keys |
| 4 | Per-address authorization | Every mutator calls `.require_auth()` on the correct Stellar account |
| 5 | On-chain persistent storage | Sub-pools, farmer registry, settled keys in `e.storage().persistent()` / `.instance()` |
| 6 | On-chain event log | Every mutator publishes via `e.events().publish(...)` |
| 7 | Ledger-timestamped scheduling | Claim cooldowns against `e.ledger().timestamp()` |
| 8 | SEP-31 anchor cash-out (stub) | PHP off-ramp modeled on Stellar's cross-border payment standard |

---

## Data Model

### SubPool

```rust
pub struct SubPool {
    pub funder: Address,
    pub balance: i128,
    pub region: u32,              // PH region code (1–19, 40 for MIMAROPA)
    pub signal_threshold: u32,    // minimum typhoon signal level to trigger
    pub payout_per_farmer: i128,
    pub installments: u32,        // 1 = lump sum; >1 = recurring
    pub claim_period_secs: u64,   // seconds between installment claims
    pub trigger_expiry: u64,      // unix timestamp; 0 = no expiry
    pub status: PoolStatus,       // Active | Paused | Exhausted
}
```

### Farmer

```rust
pub struct Farmer {
    pub addr: Address,
    pub region: u32,
    pub registered_by: Address,
    pub source: Symbol,           // RSBSA | COOP | NGO (≤9 chars)
}
```

### Event

```rust
pub struct Event {
    pub region: u32,
    pub signal: u32,
}
```

### OracleSig

```rust
pub struct OracleSig {
    pub key_index: u32,           // which oracle key (0, 1, 2, ...)
    pub signature: BytesN<64>,    // Ed25519 signature
}
```

### Release (ledger entry)

```rust
pub struct Release {
    pub event_id: u64,
    pub pool_id: u64,
    pub funder: Address,
    pub farmer: Address,
    pub amount: i128,
}
```

### InstallmentProgress

```rust
pub struct InstallmentProgress {
    pub paid: u32,
    pub event_id: u64,
    pub last_ts: u64,
}
```

### Storage keys (DataKey enum)

| Key | Storage | Contents |
|---|---|---|
| `Pool(u64)` | persistent | SubPool |
| `FarmerReg(Address)` | persistent | Farmer |
| `Settled(event_id, farmer, pool_id)` | persistent | bool — idempotency guard |
| `Event(u64)` | persistent | Event |
| `UsedNonce(u64)` | persistent | bool — replay guard |
| `Progress(pool_id, farmer)` | persistent | InstallmentProgress |
| `Ledger(Address)` | persistent | Vec\<Release\> per funder |
| `RegionFarmers(u32)` | persistent | Vec\<Address\> index by region |
| `Token` | instance | settlement token address |
| `OracleKeys` | instance | Vec\<BytesN\<32\>\> |
| `OracleThreshold` | instance | u32 |
| `Admin` | instance | Address |
| `NextPoolId` | instance | u64 counter |
| `NextEventId` | instance | u64 counter |

---

## Contract Function Surface

### Constructor

```rust
pub fn __constructor(
    e: Env,
    admin: Address,
    oracle_keys: Vec<BytesN<32>>,
    threshold: u32,
    token: Address,
)
```

Atomic at deploy. Rejects empty key set, zero threshold, threshold > key count, duplicate pubkeys.

### Funder operations (all require funder auth)

| Function | Auth | Description |
|---|---|---|
| `deposit(funder, amount, region, threshold, payout, installments, claim_period_secs, trigger_expiry) → pool_id` | funder | Create sub-pool, transfer tokens to escrow |
| `top_up(pool_id, amount)` | funder | Add balance; cures Exhausted status |
| `withdraw_unspent(pool_id)` | funder | Return balance; blocked until `trigger_expiry` if set |
| `pause_pool(pool_id)` | funder | Pause — blocks claims and settlement |
| `resume_pool(pool_id)` | funder | Resume from Paused only |

### Admin operations (require admin auth)

| Function | Auth | Description |
|---|---|---|
| `set_admin(new_admin)` | admin | Rotate admin key |
| `register_farmer(addr, region, source)` | admin | Add farmer to registry + region index |
| `remove_farmer(addr)` | admin | Remove from registry + region index |

### Oracle + settlement (permissionless relay; authority is in signatures)

| Function | Auth | Description |
|---|---|---|
| `report_event(region, signal, nonce, sigs) → event_id` | none (sig-verified) | Verify 2-of-3 threshold, record event, reject used nonce |
| `settle_event(event_id) → released_count` | none | Release all matching pools to all region farmers; idempotent, flag-not-fail |

### Farmer operations (require farmer auth)

| Function | Auth | Description |
|---|---|---|
| `claim(farmer, pool_id)` | farmer | Pull next installment; enforces cooldown, region match, pause, balance |

### Views (read-only, no auth)

| Function | Returns |
|---|---|
| `pool(pool_id)` | SubPool |
| `event(event_id)` | Event |
| `farmer(addr)` | Farmer |
| `oracle_config()` | (Vec\<BytesN\<32\>\>, u32) — keys + threshold |
| `farmers_in_region(region)` | Vec\<Address\> |
| `funder_ledger(funder)` | Vec\<Release\> |

---

## Error Codes

| Code | Name | Cause |
|---|---|---|
| 2 | `NotInitialized` | Instance storage key missing (shouldn't happen post-deploy) |
| 3 | `PoolNotFound` | No pool at given ID |
| 4 | `FarmerNotFound` | Address not in registry |
| 5 | `FarmerAlreadyRegistered` | Re-register attempt |
| 6 | `InvalidAmount` | amount ≤ 0 |
| 7 | `InvalidPayout` | payout ≤ 0 |
| 8 | `InvalidInstallments` | installments < 1 |
| 9 | `PoolNotPaused` | `resume_pool` called on non-paused pool |
| 10 | `NonceAlreadyUsed` | Replay attempt on `report_event` |
| 11 | `EventNotFound` | `settle_event` given unknown event_id |
| 12 | `InvalidPeriod` | installments > 1 with claim_period_secs = 0; or expiry already past |
| 13 | `PoolPaused` | `claim` on paused pool |
| 14 | `PoolUnderfunded` | `claim` with insufficient balance (not exhausted — exact amount check) |
| 15 | `NothingToClaim` | No InstallmentProgress — pool wasn't settled for this farmer |
| 16 | `AllInstallmentsPaid` | All tranches claimed |
| 17 | `ClaimNotDueYet` | `now < last_ts + claim_period_secs` |
| 18 | `RegionMismatch` | Farmer's current registry region ≠ pool's region |
| 19 | `NotExpiredYet` | `withdraw_unspent` before trigger_expiry |
| 20 | `InsufficientOracleSigs` | Fewer valid distinct-index sigs than threshold |
| 21 | `InvalidOracleConfig` | Empty keys, zero threshold, threshold > key count, duplicate key, bad key_index |

---

## On-Chain Events

Every mutator emits a Soroban contract event. All events verifiable on stellar.expert.

| Symbol | Topics | Data | Emitted by |
|---|---|---|---|
| `deposit` | `(deposit, funder)` | `(pool_id, amount)` | `deposit` |
| `top_up` | `(top_up, pool_id)` | `amount` | `top_up` |
| `withdraw` | `(withdraw, pool_id)` | `amount` | `withdraw_unspent` |
| `pause` | `(pause, pool_id)` | `()` | `pause_pool` |
| `resume` | `(resume, pool_id)` | `()` | `resume_pool` |
| `set_admin` | `(set_admin,)` | `(old_admin, new_admin)` | `set_admin` |
| `reg_farm` | `(reg_farm, addr)` | `region` | `register_farmer` |
| `rm_farm` | `(rm_farm, addr)` | `()` | `remove_farmer` |
| `event` | `(event, event_id)` | `(region, signal)` | `report_event` |
| `exhausted` | `(exhausted, funder)` | `(event_id, pool_id)` | `settle_event` (dry pool) |
| `release` | `(release, funder, farmer)` | `(event_id, pool_id, amount)` | `settle_event` |
| `claim` | `(claim, funder, farmer)` | `(event_id, pool_id, amount)` | `claim` |

---

## Farmer Flow

1. **Splash** — dove logo, "Relief that moves." tagline, boot check.
2. **Connect** — "Is this you?" screen. Shows name + full region (e.g. "Region V — Bicol"). Optional: reveal account address. Demo switcher for Mang Ramon / Aling Nena.
3. **Home** — total wallet balance in PHP (XLM × ₱57.5), Quick Help, Cash Out button, recent transaction rows.
4. **Activity** — full receipt list with amounts, dates, fund source labels.
5. **Detail** — pool detail drawer. Shows only pools in the farmer's region. Installment status, next claim date, claim button if due.
6. **Tx Detail** — single release record, link to stellar.expert.
7. **Cash Out** — 5-screen SEP-31 anchor stub:
   - Destination (GCash / bank / OTC)
   - Recipient (name, account)
   - Amount (in PHP, converted from XLM)
   - Confirm
   - Success

---

## Funder Flow

1. **Login** — pick institution (ADB APDRF or PCIC). Strict funder isolation: the logged-in funder's data is the only data that appears anywhere in the console.
2. **Home** — escrow hero widget (total deposited, total released, total locked), circular quick-actions, recent release feed grouped by signed event.
3. **Pools** — all sub-pools grouped by island (Luzon / Visayas / Mindanao). Status pills (Active / Paused / Exhausted). Plain-language rule ("When typhoon signal ≥ 3 hits Bicol → ₱5,000 per farmer"). "Acting as" switcher at top re-scopes the whole dashboard to the other funder without a re-login.
4. **Create Pool** — modal: region picker (all 18 PH regions), signal threshold (1–5), payout amount, installments, claim period, optional trigger expiry. Currency-aware input (ADB = USD, PCIC = PHP; both convert to settlement units).
5. **Top Up** — modal on existing pool. Auto-cures `Exhausted`.
6. **Farmers** — registry table. Funders see it read-only. LGU Mode signs register/remove with the admin key.
7. **Trigger Typhoon** — drop a PAGASA-style JSON bulletin (`{ regions: [{ region, signal }] }`) or fill manually. App shows region-by-region preview: which pools match, which skip, expected releases. Submit → `oracle-sign` → `report_event` → `settle_event` for each region sequentially with progress indicators.
8. **Ledger** — per-funder release history. Each row: farmer address, amount, event ID, pool ID, timestamp. Rows link to stellar.expert.
9. **Settings** — oracle public keys, threshold, contract address, network passphrase, RPC URL.

---

## Demo Slate

Seeded by `tools/seed-demo.mjs` after a fresh deploy. Leaves the contract in "Armed" state — pools funded, farmers registered, no event fired yet. The typhoon is triggered live during the demo.

### Farmers

| Name | Role | Region |
|---|---|---|
| Mang Ramon | `farmer` | Region V — Bicol (code 5) |
| Aling Nena | `farmer2` | Region VIII — Eastern Visayas (code 8) |

### Funders

| Institution | Role | Currency |
|---|---|---|
| ADB APDRF | `funder` | USD |
| PCIC | `funder2` | PHP |

### Regions (PH codes)

The contract stores regions as bare `u32`. The frontend translates to names. All 18 official PH regions are supported, plus MIMAROPA (code 40).

```
1   Region I — Ilocos
2   Region II — Cagayan Valley
3   Region III — Central Luzon
4   Region IV-A — CALABARZON
40  MIMAROPA Region
5   Region V — Bicol
6   Region VI — Western Visayas
7   Region VII — Central Visayas
8   Region VIII — Eastern Visayas
9   Region IX — Zamboanga Peninsula
10  Region X — Northern Mindanao
11  Region XI — Davao
12  Region XII — SOCCSKSARGEN
13  Region XIII — Caraga
14  NCR — National Capital Region
15  CAR — Cordillera Administrative Region
18  NIR — Negros Island Region
19  BARMM — Bangsamoro (Muslim Mindanao)
```

Island groups (used for UI section headers):

- **Luzon:** 1, 2, 3, 4, 40, 5, 14, 15
- **Visayas:** 6, 7, 8, 18
- **Mindanao:** 9, 10, 11, 12, 13, 19

---

## Environment Variables

`celerity-web/.env` (gitignored — copy from `.env.example`):

| Variable | Public? | Purpose |
|---|---|---|
| `VITE_RPC_URL` | yes (browser bundle) | Soroban Testnet RPC |
| `VITE_NETWORK_PASSPHRASE` | yes | Testnet passphrase |
| `VITE_CONTRACT_ID` | yes | Deployed contract ID |
| `FUNDER_SECRET` | server-only | ADB APDRF + admin (alice) signing key |
| `FUNDER2_SECRET` | server-only | PCIC signing key |
| `FARMER_SECRET` | server-only | Mang Ramon signing key |
| `FARMER2_SECRET` | server-only | Aling Nena signing key |
| `ORACLE_SECRET` | server-only | Oracle key index 0 |
| `ORACLE_SECRET_2` | server-only | Oracle key index 1 (required for 2-of-3) |
| `ORACLE_SECRET_3` | server-only | Oracle key index 2 (optional third signer) |

Never set `VITE_*_SECRET` — Vite bakes `VITE_` vars into the public JS bundle.

---

## Build & Deploy

### Frontend (local dev)

```bash
cd celerity-web
npm install
cp .env.example .env   # fill in secrets
npm run dev
```

Requires `@stellar/stellar-sdk` ≥ 16.

### Contract prerequisites

- Rust ≥ 1.84 with `wasm32v1-none` target: `rustup target add wasm32v1-none`
- Stellar CLI v27: `cargo install stellar-cli`
- Funded Testnet identity: `stellar keys generate alice --network testnet --fund`

### Build

```bash
cd contracts/celerity
stellar contract build
```

Output: `target/wasm32v1-none/release/celerity.wasm`

### Test

```bash
cargo test
# 57 tests, all passing
```

### Deploy

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/celerity.wasm \
  --source-account alice --network testnet -- \
  --admin "$(stellar keys address alice)" \
  --oracle_keys '["<64-hex pubkey 0>", "<64-hex pubkey 1>", "<64-hex pubkey 2>"]' \
  --threshold 2 \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

The constructor runs atomically at deploy — no separate init call that could be front-run.

### Seed demo slate

```bash
cd celerity-web
node ../tools/seed-demo.mjs
```

Creates pools and registers farmers. Leaves the contract Armed with an empty ledger.

---

## Test Suite

**Location:** `contracts/celerity/src/test.rs`  
**Count:** 57 tests, all passing

### Coverage areas

- **Core escrow:** deposit, top_up, withdraw_unspent, pause/resume — including boundary amounts and expiry
- **Farmer registry:** register, remove, region index consistency, source tagging
- **Oracle multi-sig:** 2-of-3 threshold verification, duplicate-index rejection, wrong signature rejection, nonce replay rejection, insufficient sigs
- **Settlement — idempotency:** same event + farmer + pool never double-pays
- **Settlement — isolation:** one funder's pool exhaustion never reverts another's release
- **Settlement — dry pool (flag-not-fail):** underfunded pool is marked `Exhausted`, skipped; other pools release normally
- **Recurring installments:** cooldown enforcement, `AllInstallmentsPaid` guard, region mismatch guard, paused-pool block
- **Auth adversarial cases:** wrong funder can't touch another pool; non-admin can't register farmers; oracle-role can't invoke; each `require_auth` tested by mocking only the attacker

### Test helpers

- `cerr(e)` — expected `.err()` for a contract error panic
- `auth_err()` — expected `.err()` for a `require_auth` rejection (Context/InvalidAction)
- `assert_root_auth(s, who, fn_name)` — verifies the contract-level `require_auth` is rooted at the correct address (not just a token sub-call auth)

---

## Deployment History

Live contract on Testnet: `CDBLJQOTCGQREBJFLRIS73AZECOX7HINQMA22ZDBSLFE7LWMU2ONC5Z3`

Previous deployments preserved in `deployments.json`:

| Phase | Contract ID |
|---|---|
| 0 | `CCNGY2SDMTXYTXU57EK37NBR4D7M43LVV4HF632BIALIJ2ZRISUVWIMX` |
| 1 pre-review fix | `CBLBN25BUURXCPAWJWO6MNRIVGRFSCOYVH7WAVFXNEGUCPLF35STK7ED` |
| 1 QA | `CCO2BHML2QCP6XIPMZEDIXP3U6FZZ35YXFTCCCEBL33AJB3DCU2BRZN7` |
| 2 | `CAL64YFBWUAE4OXLA3ZYSEQ7WZW73DPHDLPHW4F4AVEJ2TMPAJ5GAWZ7` |
| 3 | `CDWFQPHFK5PT55AQWAJYE2FSQ4XLXCBRWTFZFJXVYJ4IYM4IOSV7KWMM` |
| 4–5 pre-reset | `CBOC7QW3EZUABZST4KO2FHYNRUZPN3KF6QTLJSZ4H77VZKOHTJFKI2Q2` |
| 5 | `CBSXZ6TKWW5Y726ZBWC4BXSKTLW77VBXUNS4LBJA3SDDWPDXINGNESDG` |
| 6 scratch | `CA3Z5H7IMBUNAXNAYREUM2WHTWIMFJDOVTTFAAHICQKIJQNJTU2UAYN2` |
| 7 pre-secret rotation | `CAX4JXJRLGWAGG2PNC36CNJXM5KVM4L5WNK6ID6WNRQHCEIZLQVCJ2YD` |
| 8 pre-recurring fix | `CCTI4UD4HEPDT27CLBD6KMFS6CU5DESHX4NTQBQAH45GY6DG3FOA7LWQ` |
| 9 pre-claim region | `CC4CNJUTY5FCMVG3MFSMIMP6CSKAFDTK7DU6BKW5LNORGHGROJZAGKT7` |
| 10 wrong admin | `CBQ3LOUWWIEN654AXW2QOEMBIHUWE5SBPX2GWDHMBEHFI2IDSCT5YOD3` |
| 10 claim region | `CD3PDHHN447KRSSDIG2LB5ZQUZA7EJEF5TFPP4IB4N2NT4TSMR7UM67S` |
| 11 smoke | `CA6HI34MNNFKTZ5PC6EUDOL7KPBUVOHFSZQVB4OTVDSFXNEJB375K7YX` |
| 11 multisig | `CCBYIINXFRTA54PKLPISWLOSII3AIXRV53KMLN42G2IFL5YKGK3BO3PU` |
| 12 source tag | `CD74SBDG5DZDTWF4YRMSIFWNBXTUKPNZRPPQ4E5UY43RD5JBPQSV2KNU` |
| **13 (current)** | `CDBLJQOTCGQREBJFLRIS73AZECOX7HINQMA22ZDBSLFE7LWMU2ONC5Z3` |

Oracle public keys (pinned at deploy):

```
0: 978174400489bcc80ec1e29d77380a3a9bcbd1adfcd1017a32ae5c7df3d30859
1: b8678bd8f5386a42923546fd4db781c017bba0011730a8efa98e0bedbb429571
2: 143443a6bf3ed1b974b5be90ef3f51ee150cd1798f42be9f7ce8b0c7c0d734b9
```

Threshold: 2  
Settlement token: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (native XLM SAC)

---

## Honest Stubs

Two components are clearly labeled mocks in both the codebase and the UI:

### Oracle feed

A Node.js Ed25519 signer stands in for authorized PAGASA / JMA / NDRRMC signed bulletins. The signing protocol and key structure are production-shaped (2-of-3 threshold, indexed sigs, `CELERITY-EVENT-V1` prefix, nonce replay protection). Only the key holders are simulated.

### Anchor cash-out

`anchor.js` labels itself: `"SEP-31 protocol mock · PDAX UAT target — demo conversion, not a live cash-out"`. FX rate is fixed at ₱57.5 per settlement unit. Everything before the anchor (escrow, trigger verification, multi-funder release, registry, ledger, claim) is real on-chain.

---

## Design Rules

Non-negotiable invariants from `docs/product/PROJECT.md`:

1. **The contract never interprets documents.** It verifies signatures and compares integers. No text parsing, no document reading.
2. **Funders are independent.** One funder's release, pause, or exhaustion must never touch another's money.
3. **Flag, never silently fail.** Underfunded pool mid-event → flag `Exhausted` and continue. Never revert the whole event.
4. **Idempotent releases.** Same event + farmer + pool can never pay twice. Composite settled-key enforces this.
5. **Human judgment stays with humans.** The registry is maintained by an admin/LGU role, not decided by the contract.
6. **Honest stubs.** The anchor cash-out and live weather feed are mocked. Never disguise a stub as working infra.

---

## Repo Layout

```
contracts/celerity/
  src/lib.rs          Data model + full function surface (717 lines)
  src/test.rs         57 unit / adversarial tests
  Cargo.toml
  Makefile

celerity-web/
  api/
    _lib/
      env.js          Secret loading (server-only)
      gate.js         Rate limiter
      serialize.js    BigInt-safe JSON encode/decode for contract types
      stellar.js      Contract client factory + oracle signer
      vitePlugin.js   Dev-mode API routing middleware
    addresses.js      GET /api/addresses
    invoke.js         POST /api/invoke
    oracle-sign.js    POST /api/oracle-sign
  public/
    favicon.png       Dove favicon
    logo-dove.png     Dove mark
    logo-lockup.png   Full wordmark
  src/
    design/           Design system components + tokens.css
    lib/
      activityRows.js   Transaction row formatter
      activityTime.js   Relative time display
      anchor.js         FX helpers, demo PHP conversion
      api.js            Browser → /api/* fetch wrappers
      celerity.js       Contract client (reads: browser simulation; writes: via API)
      claimCooldown.js  Next claim date calculator
      config.js         Vite env var exports
      endedPools.js     Completed pool detector
      errors.js         Error message mapping
      farmerDemoState.js Demo farmer switcher state
      farmers.js        Demo farmer metadata
      funders.js        Demo funder metadata (ADB + PCIC)
      poolNames.js      Human-readable pool name generator
      regions.js        All 18 PH region codes + names + island groups
      sep24.js          SEP-24 flow stub
      sep31.js          SEP-31 cash-out stub
      tours.js          CoachTour step definitions
      useCountUp.js     Animated counter hook
      viewport.js       Mobile viewport detection hook
    pages/
      farmer/           Farmer app screens
      funder/           Funder console screens
      transparency/     Public ledger page
    App.jsx             Route dispatch (farmer vs funder vs transparency)
    main.jsx            React entry point
    styles.css          Global styles

oracle/
  generate-key.js     CLI: generate Ed25519 keypair
  sign-event.js       CLI: sign a single event
  sample-bulletin.json  Example PAGASA-style bulletin
  package.json

tools/
  seed-demo.mjs       Seed pools + farmers (no event fired)
  capture-screenshots.mjs  Playwright screenshot capture

screenshots/          28 product screenshots

docs/
  README.md           Docs index
  hackathon/          Hackathon submission docs
  product/
    PROJECT.md        Design rules + win condition
    design.md         Design system spec
    TEST-COVERAGE.md  Test coverage + error-path matrix

deployments.json      Public Testnet deployment metadata
DEMO-SCRIPT.md        Stage demo checklist
README.md             Main README (source of truth for hackathon judges)
Cargo.toml            Workspace Cargo config
Cargo.lock
```

---

## Links

| Resource | URL |
|---|---|
| Live demo | https://stellar-celerity.me/ |
| Contract on stellar.expert | https://stellar.expert/explorer/testnet/contract/CDBLJQOTCGQREBJFLRIS73AZECOX7HINQMA22ZDBSLFE7LWMU2ONC5Z3 |
| Presentation | https://canva.link/ydnjf2yvz0dybpw |
| Demo video | https://drive.google.com/file/d/1xSrghLvS7HGgZDI5f59QABwXWCzt8r91/view?usp=sharing |
| GitHub | https://github.com/thanreiz/Celerity |

---

## Credits

**Ethan Dreiz Baltazar** — solo developer.  
Built, designed, and shipped Celerity end to end: smart contract, oracle stub, farmer app, funder console, demo slate, docs.

GitHub: [thanreiz](https://github.com/thanreiz)
