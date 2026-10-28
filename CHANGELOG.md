# Changelog

Newest first. History before the PayPal rebuild lives in the original repo,
[github.com/thanreiz/Celerity](https://github.com/thanreiz/Celerity).

---

## 2026-10-28 — v0.2.0 PayPal rebuild (Celerity Relief)

- Removed the Stellar stack: Soroban contract, Ed25519 oracle, Stellar SDK,
  SEP-24/31 anchor flow, farmer wallet app, Vercel functions.
- New `server/` (Node 24, Express 5): Claude tool-use agent that reads
  free-text typhoon bulletins and drafts payouts; deterministic policy engine
  (signal minimum, per-family / per-run / recipient caps, no repeat payment per
  storm); coordinator approval; PayPal Payouts with idempotent batch IDs;
  verified, de-duplicated PayPal webhooks plus a poll fallback; JSON store with
  a SHA-256 hash-chained evidence log.
- New coordinator console (Overview, Respond, Payouts, Families, Evidence log)
  and a public transparency page, on the existing design system.
- PayPal sandbox smoke script, node:test suites, CI, Render blueprint, MIT license.
