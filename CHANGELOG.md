# Changelog

Newest first. History before the PayPal rebuild lives in the original repo,
[github.com/thanreiz/Celerity](https://github.com/thanreiz/Celerity).

---

## 2026-10-30 — v0.3.0 Fund step, farmer phone page, QA fixes

- **Fund:**
  - Funders pay into pools earmarked by province through PayPal Checkout
    (Orders v2), from the public page.
  - A pool is credited once, on a completed capture, via the return redirect
    or the `PAYMENT.CAPTURE.COMPLETED` webhook.
  - Payouts are split pro-rata across the pools covering each family, and the
    public page shows each funder's ledger.
- **Farmer phone page:**
  - A private link per family, sent by a simulated SMS in Tagalog and English.
  - It opens the family's own sent payouts with a live Approved → Sent →
    Received status, which funders paid, bulletin-to-money minutes, and how to
    cash out to GCash or a bank.
- **QA fixes (31 issues):**
  - Approval no longer holds a lock across PayPal and resumes safely after a
    lost answer.
  - The public log is an allow-list per event type.
  - Policy, agent input and status-ordering hardening.
  - Generic errors and wrong-key throttling.
  - Mobile tables and accessibility.
  - Asset caching and share previews.
- **Hosting:** Vercel (free) with Neon Postgres. Render was dropped.
- Tests: 58 (from 14).

## 2026-10-28 — v0.2.0 PayPal rebuild (Celerity Relief)

- Replaced the old payment and trigger layer, the recipient wallet app, and
  the Vercel functions.
- New `server/` (Node 24, Express 5): Claude tool-use agent that reads
  free-text typhoon bulletins and drafts payouts; deterministic policy engine
  (signal minimum, per-family / per-run / recipient caps, no repeat payment per
  storm); coordinator approval; PayPal Payouts with idempotent batch IDs;
  verified, de-duplicated PayPal webhooks plus a poll fallback; JSON store with
  a SHA-256 hash-chained evidence log.
- New coordinator console (Overview, Respond, Payouts, Families, Evidence log)
  and a public transparency page, on the existing design system.
- PayPal sandbox smoke script, node:test suites, CI, Render blueprint, MIT license.
