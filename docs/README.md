# Docs

Judge- and public-facing documentation for **Celerity**. The live product is unchanged — this folder only organizes narrative and planning docs.

## Start here

| Need | Go to |
| --- | --- |
| Live demo | [https://stellar-celerity.me/](https://stellar-celerity.me/) |
| Stage checklist | [`../DEMO-SCRIPT.md`](../DEMO-SCRIPT.md) |
| Contract ID / network | [`../deployments.json`](../deployments.json) |
| Repo landing | [`../README.md`](../README.md) |

## Product

| Doc | What it is |
| --- | --- |
| [`product/PROJECT.md`](product/PROJECT.md) | Design rules and win condition |
| [`product/design.md`](product/design.md) | Design system |
| [`product/TEST-COVERAGE.md`](product/TEST-COVERAGE.md) | Visible test suite + error-path matrix (57/57) |

## Hackathon

| Doc | What it is |
| --- | --- |
| [`hackathon/Celerity_Hackathon_Doc.md`](hackathon/Celerity_Hackathon_Doc.md) | Full hackathon write-up |
| [`hackathon/Celerity_Stellar_Setup.md`](hackathon/Celerity_Stellar_Setup.md) | Stellar / Soroban setup notes |
| [`hackathon/DEMO-VIDEO-TWITTER.md`](hackathon/DEMO-VIDEO-TWITTER.md) | Short demo video roadmap + teleprompter |

## Source (do not relocate)

These paths are the running system — leave them where they are:

- `contracts/celerity` — Soroban escrow / trigger / settle
- `celerity-web` — farmer + funder UI + API routes
- `oracle` — Ed25519 bulletin signer (demo stub)
- `tools/seed-demo.mjs` — fresh-contract demo seed
- `screenshots/` — product gallery (see root README)
