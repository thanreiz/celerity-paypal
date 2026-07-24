# Celerity DEMO-SCRIPT — Championship Finale

**Total:** 8–9 minutes live + ≤20s Q&A cards  
**Money-shot:** ~90–120 seconds  
**One sentence:** Celerity is the multi-funder disaster settlement rail on Stellar — ADB brings dollars, PCIC brings pesos, one signed weather event releases independent pools, farmers only ever receive pesos via SEP-31 (PDAX UAT target).

---

## Pre-flight (T−30 min)

- [ ] Fresh slate: region-5 farmers = Mang Ramon + Aling Nena **only**; ADB + PCIC Bicol pools solvent for **2× payout**; ledger empty if possible
- [ ] If ledger already has rows: either redeploy + `cd celerity-web && node ../tools/seed-demo.mjs`, or narrate “prior rehearsals” and point at **new** event lines only
- [ ] Backup contract ID written down; second browser profile logged in as PCIC
- [ ] Backup screen recording of money-shot ready (no live debug >15s)
- [ ] Sample bulletin or “Load sample” path rehearsed
- [ ] Farmer app open on phone / second window as Mang Ramon

**Live contract (as of last prep):** `CAX4JXJRLGWAGG2PNC36CNJXM5KVM4L5WNK6ID6WNRQHCEIZLQVCJ2YD`  
Dry-run confirmed: one region-5 settle paid Ramon + Nena from ADB pool #1 and PCIC pool #3; re-settle returned **0**.

---

## Stage protocol (timed)

### 1. Human open — Mang Ramon (40s)

> “When Signal #3 hits Bicol, Mang Ramon shouldn’t wait for paperwork. He needs pesos in hand — from every funder that earmarked his region.”

Point at farmer app (empty or waiting). Promise: we will settle **two funders → two farmers** live.

### 2. Flowchart — on-ramp → oracle → settle → off-ramp (90s)

Draw / show:

1. **SEP-24** (PDAX UAT target) — ADB USD / PCIC PHP → settlement asset  
2. **Soroban escrow** — independent sub-pools  
3. **Ed25519 oracle** — signed signal + region + nonce  
4. **settle_event** — flag-not-fail, idempotent  
5. **SEP-31** (PDAX UAT target) — farmer PHP / GCash  

Say once: *Testnet XLM stands in for USDC. XLM is not the product currency.*

### 3. Live money-shot (90–120s)

1. Funder console → **Trigger Typhoon** → load sample (or bulletin)  
2. Show Bicol matches **two pools** (ADB + PCIC)  
3. **Sign & settle** — watch signature + releases  
4. Ledger / home feed: **Mang Ramon** and **Aling Nena** from **both** funders (4 lines)  
5. Re-settle same event → **0 new releases** (idempotent)  
6. Farmer app: balance up · “already yours if offline” · SMS receipt mock  
7. Withdraw → SEP-31 status chips → mock completed (honest label)

**Say:** “Two funders. Two farmers. One signed event. Money already theirs.”

### 4. Mechanism + correct SEPs (40s)

- Contract verifies signature and compares numbers — never reads documents  
- Sub-pools never touch each other’s money  
- SEP-24 in / SEP-31 out — protocol-faithful mocks labeled PDAX UAT; release logic is live Testnet  

### 5. Institutional trust (40s)

- ADB (multilateral) and PCIC (state insurer) as independent funders  
- LGU owns the farmer registry — human judgment stays with humans  
- Per-funder ledger on-chain; stellar.expert links  

### 6. Close (20s)

> “Celerity is not an insurer and not an offline wallet — it is the multi-funder disaster capital rail on Stellar.”

---

## Q&A cards (≤20s each)

| Question | Answer |
|---|---|
| **Unregistered farmer?** | Registry is LGU/admin. Unregistered addresses get nothing. |
| **LGU pause?** | `pause_pool` — that funder’s pool skips; others still settle. |
| **Oracle trust?** | Authorized Ed25519 key; nonce replay protection; contract never parses essays. |
| **Why XLM?** | Testnet stand-in for USDC. Production = SAC stablecoin; XLM is fees/sponsorship. |
| **PDAX UAT?** | Target licensed VASP for SEP-24/31. Demo uses protocol-faithful mocks so the stage never flakes. |
| **vs Pijin?** | Pijin moves money when a person can text. We move disaster capital when weather is signed. |
| **vs TyFi?** | TyFi is the insurer vault. We are the rail **under** insurers and donors. |
| **Mainnet?** | Same contract pattern; swap SAC + live VASP quotes. Not required for this demo. |
| **Dry pool mid-event?** | Flag that pool; continue solvent pools. Never revert the whole typhoon. |
| **Double pay?** | Settled composite key `(event, farmer, pool)` — re-settle is a no-op. |

---

## Fail-safe

| Failure | Action |
|---|---|
| RPC hang | Switch to backup recording within 15s |
| Wrong identity | Second browser profile already on PCIC / farmer |
| Empty ledger after settle | Refresh; if still empty, backup GIF + explain idempotency from prior dry-run |
| Bulletin parse error | “Load sample bulletin” — never improvise JSON on stage |

---

## Success check

Judges leave thinking: *Full Stellar rail — SEP in, Soroban multi-funder settle to two farmers, SEP out — live Testnet, honest PDAX UAT labels, clearest disaster capital mechanism in the field.*
