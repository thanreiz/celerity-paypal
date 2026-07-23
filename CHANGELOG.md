# Changelog

Human-readable log of changes, newest first. Contract redeploys are also tracked
in `deployments.json` (`previous_contract_ids`).

---

## 2026-07-10 — Funder-console redesign shipped, fresh demo slate, docs

### Frontend — funder console redesign (login-first, GCash-style)
Ported the approved HTML mockups into the React app. The dev/funder side went from
a sidebar console to a login-first, isolation-safe product.

- **New** `src/pages/funder/LoginScreen.jsx` — pick-your-institution gate (ADB APDRF
  / PCIC); sets the acting identity before the portal renders.
- **New** `src/pages/funder/FunderHome.jsx` — GCash-style home: escrow hero (one peso
  figure), circular quick-actions, state-aware demo guide, and a release feed grouped
  by signed event with per-row on-chain links.
- **Rewrote** `src/pages/funder/FunderPortal.jsx` — login gate, corner-cluster header
  (Farmer App / Public Ledger / switch-institution), page router; removed the old
  SideNav/TopBar chrome.
- **Rewrote** `src/pages/funder/PoolsPage.jsx` — strict per-funder isolation, island
  groups (Luzon/Visayas/Mindanao) with status-mix pills, typhoon-context banner
  (calm/alert), Released-to-date stat (flips to an Exhausted alert only when real),
  per-pool release history, paused-card treatment with a green Resume.
- **Rewrote** `src/pages/funder/OraclePage.jsx` — PAGASA-bulletin drop-zone: drop a
  signed JSON bulletin (or load the sample), see region-by-region "will settle / will
  skip", then sign + settle one event per region. Manual single-region fallback kept.
  DEMO SIGNER badge retained.
- **Updated** `src/pages/funder/LedgerPage.jsx`, `CreatePoolModal.jsx`,
  `FarmersPage.jsx`, `SettingsPage.jsx`, `DemoGuide.jsx` — pesos-primary, pool names +
  region names throughout, region dropdowns, LGU registrar wording.
- **Updated** `src/App.jsx` — removed the white dev top strip; funder console owns its
  chrome; keep the portal mounted during a Public-Ledger round trip so the logged-in
  identity survives; added a first-load gate so the hero doesn't flash ₱0 before the
  pool scan finishes.

### Frontend — supporting libs
- **New** `src/lib/funders.js` — one source of truth for the two demo funders (drives
  login, header, switcher, settings), so anything ADB gets, PCIC gets.
- **New** `src/lib/regions.js` — PH region display map (UI-only; contract stores bare
  `u32`). All 18 regions: the 13 numbered + NCR, CAR, BARMM, MIMAROPA, NIR. Island
  groupings, short-name helper, ordered dropdown options.
- **New** `src/lib/poolNames.js` — pool names/purposes as an app-level label
  (localStorage); region-derived fallback when unnamed.
- **Updated** `src/lib/celerity.js` — added `reportAndSettleMany()` (multi-region: one
  signed event per region, unique nonces to avoid `NonceAlreadyUsed`, flag-not-fail so
  one region's error never aborts the rest); `reportAndSettle()` now takes a role +
  nonce so either funder can trigger.

### On-chain — fresh demo slate
- Redeployed a clean contract (same wasm; oracle key + XLM SAC token reused). Old id
  preserved in `deployments.json` under `phase_4_5_pre_reset`.
  - New: `CBSXZ6TKWW5Y726ZBWC4BXSKTLW77VBXUNS4LBJA3SDDWPDXINGNESDG`
  - Old: `CBOC7QW3EZUABZST4KO2FHYNRUZPN3KF6QTLJSZ4H77VZKOHTJFKI2Q2`
- **Updated** `celerity-web/.env` — `VITE_CONTRACT_ID` repointed (gitignored; only that
  line changed).
- **Updated** `deployments.json` — rotated contract id + phase note + history.
- **New** `tools/seed-demo.mjs` — repeatable seed of the demo money-shot: 4 farmers
  (farmer1 + 3 generated), ADB pools (Bicol, N. Mindanao) + PCIC pools (Bicol,
  E. Visayas — paused). Leaves every pool Armed and the ledger empty (no typhoon fired)
  so the trigger is live on stage.

### QA
- Full-stack gate (2026-07-10): contract `cargo test` 46/46, frontend build clean,
  18-check headless sweep of the live stack (both identities, funder isolation,
  oracle bulletin analysis, no console errors, 390px no-overflow). Verdict PASS.

### Docs / submission
- **Updated** `Celerity_Hackathon_Doc.md` §7 (demo stage script → real UI: login-first,
  PCIC not NGO, in-app bulletin drop, multi-region) and §8 (build timeline →
  actual-progress record with the redesign, multi-region oracle, all-18-regions, and
  fresh slate; "win condition — met").
- **New** `CHANGELOG.md` — this file.
