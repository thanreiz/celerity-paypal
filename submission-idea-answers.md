# Celerity — Stellar Hackathon Idea Submission (copy-paste answers)

Drafted from `Celerity_Hackathon_Doc.md` §1–2, updated to what's actually built as of
Jul 10 (multi-region bulletin trigger, login-first funder console, ADB + PCIC both live,
fresh seeded Testnet contract). Fill the two placeholders marked **[YOU]**.

---

## Q1 — Project Name

**Celerity**

*(tagline, if a subtitle field allows one: "Disaster money that moves itself.")*

---

## Q2 — Problem Statement

When a typhoon destroys a farmer's crop, the money to help them recover usually already
exists — in a national crop-insurance fund, a regional disaster pool, or an NGO earmark.
What's slow and lossy is the last mile. The Philippine Crop Insurance Corporation (PCIC)
processes most claims in about 20 working days and is targeting 10, but the payout itself
is still handed out as **physical indemnity checks at regional offices**, with
distributions spanning weeks. For an uninsured farmer, or one not registered under the
RSBSA system, there is no fast path at all. And when a *foreign* funder — the ADB's Asia
Pacific Disaster Response Fund, an overseas foundation — wants to help, its money can't
reach a farmer directly: it routes through national then local agencies, taking
additional weeks, with no way for that funder to verify where it landed.

Existing solutions don't close this because each reintroduces an intermediary. PCIC's
parametric pilot removes the field inspection but still ends in agency-run check
distribution, and is single-funder and peso-only — it structurally cannot ingest foreign
USD and route it to a farmer, nor let that funder audit the disbursement. The missing
mechanism is a neutral settlement layer that (a) lets multiple independent funders act on
one objective trigger and (b) delivers value directly to the beneficiary as spendable
local cash.

---

## Q3 — Proposed Solution

Celerity is a programmable disaster-disbursement rail on Stellar. Funders deposit into a
shared Soroban escrow, each deposit earmarked as a sub-pool with its own release rule
(region, typhoon-signal threshold, payout amount, installment schedule). An authorized
oracle submits a **signed** weather event — the contract verifies an Ed25519 signature
against a stored PAGASA-role key and compares numbers; it never reads or interprets a
document. For every sub-pool whose condition the event meets, the contract releases the
payout to the pre-registered farmers in that region, on the funder's chosen schedule, and
logs a per-funder ledger entry. Payouts convert to spendable pesos through a Stellar
anchor at the edge.

Built and live on Stellar Testnet:
- **Multi-funder sub-pools** — independent earmarks, one shared trigger, strictly
  isolated (one funder's release, pause, or exhaustion never touches another's money).
- **Signed multi-region trigger** — a real typhoon hits many regions at once, so the app
  ingests a signed PAGASA-style bulletin, shows region-by-region what will settle vs.
  skip, then signs and settles one event per region (idempotent, replay-protected).
- **Recurring installments** — staged payout on an on-chain schedule, not a single lump.
- **Farmer registry** — pre-enrolled beneficiaries keyed to region, maintained by an
  LGU/co-op admin role (the contract pays a verified list; it doesn't decide who's a
  farmer).
- **Per-funder transparency ledger** — every release attributable to its funder and
  cross-checkable on-chain.
- **Anchor cash-out** — USD/stablecoin → PHP, via a clearly-labeled SEP-31 stub (the one
  leg that needs a licensed partner, not more engineering).

**Core claim:** Celerity is not a crop insurer and not a faster claims processor — it is
the settlement rail *underneath* them, letting a national insurer, a regional fund, and a
foreign foundation co-fund the same typhoon trigger and pay a farmer instant, spendable
pesos, with no agency hand-off and every peso auditable.

---

## Q4 — Target Users / Audience

- **Disaster funders** — PCIC, the ADB's APDRF, national/local calamity funds (NDRRMF),
  and NGOs: anyone holding committed disaster money that must reach individuals fast.
- **Pre-registered farmers** — RSBSA- or co-op/LGU-enrolled smallholders in
  typhoon-exposed regions; the underserved, often unbanked, non-technical beneficiary who
  receives the payout as spendable local cash.
- **Regional / international funders needing accountability** — foreign funders who must
  prove to their own stakeholders that money landed where intended.
- **Cooperatives and LGUs** — who maintain the beneficiary registry and act as the local
  enrollment layer.

---

## Q5 — Team Member Names & Roles

**[YOU — fill in.]** Example format:
- **[Your name]** — Full-stack / smart-contract lead (Soroban contract, React frontend,
  oracle signer, Testnet deployment).
- *(add teammates + roles if any)*

---

## Q6 — Which country are you located?

**Philippines**  *(confirm — inferred from the build's PH focus; change if not.)*

---

## Q7 — Expected Stellar Integration

- **Soroban smart contracts (Rust)** — the escrow, multi-funder release, Ed25519
  signed-trigger verification, farmer registry, and per-funder ledger. Live on Testnet.
- **Stellar accounts + auth scoping** — separate funder, oracle, and registry-admin
  authority (funder-auth on pool actions, admin-auth on the registry, signature-auth on
  the weather event).
- **Anchors (SEP-31 / SEP-6/24)** — fiat cash-out USD/stablecoin → PHP at the edge (the
  "real world access" leg; stubbed for the hackathon, with a licensed anchor like
  Coins.ph as the production plug-in point).
- **Native asset / path payment** — USDC/PHPC handling and conversion at settlement.
- **Stellar Testnet** — the deploy and live-demo target; every on-chain step is real and
  verifiable on stellar.expert.

---

## Q8 — Hackathon Track

**Local Finance & Real World Access**

Celerity is infrastructure for real-world money reaching real people — pre-registered
farmers receiving disaster relief as spendable local currency, not a token they can't
use. The anchor cash-out (SEP-31/SEP-6) is the core of the "real world access" claim: the
value lands as pesos through the same licensed rails Filipinos already use. And it's
"local finance" literally — it routes international disaster capital (USD) into a local
agricultural economy (PHP) that today receives that money weeks later through layers of
agencies.
