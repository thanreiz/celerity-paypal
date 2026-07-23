# PROJECT.md — Celerity

Standing design rules for this project. Read this fully before writing any code.

## What Celerity is
A programmable disaster-disbursement rail on Stellar. Funders deposit into a shared on-chain escrow, each with an earmarked sub-pool and its own release rule. An objective, signed weather event (a typhoon signal from an authorized oracle key) triggers automatic release to pre-registered farmers, which cashes out to PHP via a Stellar anchor. Every release is logged per funder.

It is **not** a crop insurer and **not** a claims processor. It is the multi-funder, cross-border settlement layer underneath them.

## Non-negotiable design rules (do not violate these without asking)
1. **The contract never interprets documents.** It verifies a signature and compares numbers (signal level, region, threshold). It never "reads" an essay, receipt, or proof. Triggers are objective only: a signed event, a schedule, or a funder's own authorized call.
2. **Funders are independent.** Each sub-pool has its own balance, rule, and authority. One funder's release, pause, or exhaustion must never touch another's money.
3. **Flag, never silently fail.** If a sub-pool is underfunded mid-event, flag it and continue releasing the solvent pools. Never revert the whole event.
4. **Idempotent releases.** The same event must never pay the same farmer from the same pool twice. Enforce on a composite settled-key.
5. **Human judgment stays with humans.** The registry (who is a farmer) is maintained by an admin/LGU role, not decided by the contract. The funder resolves exceptions.
6. **Honest stubs.** The anchor cash-out and the live weather feed are mocked for the hackathon. Keep them clearly isolated and labeled as stubs — never disguise a stub as working infra.

## Tech stack
- Smart contract: Soroban (Rust), deployed to Stellar Testnet.
- Frontend: React + Stellar SDK (JS). Two views: funder, and farmer/claim.
- Off-chain: Node.js Ed25519 oracle signer (simulates PAGASA/JMA signed events).
- Anchor: stubbed SEP-31 receiver for USD/stablecoin → PHP.

## Core data model (target — see the submission doc §6.2 for detail)
- `SubPool { funder, balance, region, signal_threshold, payout_per_farmer, installments, status }`
- `Farmer { addr, region, registered_by }`
- Keys: `Pool(u64)`, `FarmerReg(Address)`, `Settled(event_id, farmer, pool_id)`, `OracleKey`, `Admin`.

## Function surface (target)
`deposit`, `top_up`, `withdraw_unspent`, `pause_pool`, `register_farmer`, `remove_farmer`, `report_event` (sig-verified), `settle_event` (multi-pool, idempotent, flag-not-fail), `claim` (recurring pull), plus `pool`/`funder_ledger` views.

## Working agreement
- Nothing is "done" until it compiles, tests pass, and (where relevant) it's deployed to Testnet and confirmed on-chain.
- Write the adversarial tests *with* each function, not after — especially for idempotency and dry-pool cases. These are the two bugs most likely to break the demo.
- When you hit an ambiguous design choice, stop and ask rather than guessing — a wrong assumption here compounds.
- Keep functions small and the public interface stable so the frontend can develop against it in parallel.
- Never print, log, or embed a secret key. The oracle signer's key is generated and injected, never hardcoded in committed code.
- Prefer clarity over cleverness; this is a demo that must be explainable on stage in one sentence per function.

## Definition of done for the hackathon (the win condition)
One signed weather event releases at least two independently-funded, earmarked sub-pools to one registered farmer, live on Stellar Testnet, idempotently, with a per-funder ledger visible in the frontend, and a stubbed anchor step converting to PHP. Everything beyond that is a bonus.
