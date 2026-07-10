# Full-Stack Gate — contract → React frontend (redesigned funder console)

**Date:** 2026-07-10 · **Contract:** `CBOC7QW3EZUABZST4KO2FHYNRUZPN3KF6QTLJSZ4H77VZKOHTJFKI2Q2`
(the pre-reset contract — this sweep certifies the code as it stands before the
demo-slate redeploy).

Verifies the whole stack after the funder-console redesign (login-first identity,
GCash home, bulletin-driven multi-region oracle, island-grouped isolated pools).
Layers 1–2 local; layer 3 driven live against Testnet in a headless browser.

## Layer 1 — contract (local)

| Check | Result |
|-------|--------|
| `cargo test` full suite | ✅ **46 passed, 0 failed, 0 ignored** (1.08s) |

Contract source unchanged since Phase 4 — the redesign is frontend-only, so the
adversarial suite (idempotency, cross-funder isolation, dry-pool flag-not-fail,
claim schedule) still governs behavior.

## Layer 2 — frontend build

| Check | Result |
|-------|--------|
| `npm run build` (Vite production) | ✅ 255 modules transformed, no errors (1.37s) |

## Layer 3 — frontend ↔ live Testnet (headless, read-only)

Driven with Playwright against the running dev build on the live contract. No
state-changing calls issued (settlement deliberately NOT triggered). 18/18 checks
pass; **zero console/page errors** across every screen.

| # | Gate check | Result |
|---|-----------|--------|
| 1 | Farmer app loads; hero renders a ₱ value from `farmerReceipts()` | ✅ |
| 2 | Funder login screen shows exactly 2 institution cards (ADB, PCIC) | ✅ |
| 2 | ADB home: escrow hero + quick-actions render; feed shows "₱460 to date" with 2 event-group headers from live `funder_ledger` | ✅ |
| 3 | **Identity switch re-scopes the whole dashboard** — ADB vs PCIC totals differ | ✅ |
| 3 | **No funder leak** — ADB's Northern Mindanao pool never appears under PCIC | ✅ |
| 4 | Pools page: island groups, status-mix pills (armed/paused), Released-to-date stat, per-pool history | ✅ |
| 5 | Oracle: sample bulletin parses into island-grouped "will settle / will skip" rows; DEMO SIGNER badge present | ✅ |
| 6 | Farmers registry: PH region names ("Region V — Bicol"), LGU registrar-mode toggle | ✅ |
| 7 | Public Ledger round-trip returns to the funder home with identity intact | ✅ |
| 7 | 390 px viewport: no horizontal overflow | ✅ |

Gate 3 is the load-bearing correctness check — funder isolation is a non-negotiable
design rule (one funder's money/ledger must never surface under another). Verified
live by switching identities and diffing the rendered pool set + totals.

**Verdict: PASS.** Contract behavior is green locally (46/46) and the redesigned
frontend drives the full loop against the live contract with strict per-funder
isolation and no console errors. Cleared to proceed to the demo-slate redeploy.
