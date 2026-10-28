# Development log

What was built for the PayPal AI Hackathon, when, and how it was verified.
All work is after Oct 1, 2026. Times are Manila (UTC+8).

## 2026-10-28

- Removed the legacy payment and trigger layer, recipient wallet app, Vercel
  functions, and old docs/screenshots (`dd9fb3f`).
- Built `server/` (Node 24, Express 5): LLM agent with five strict-schema
  tools, policy engine (signal minimum, per-family / per-run / recipient caps,
  no repeat payment per storm), coordinator approval, PayPal Payouts with
  idempotent batch IDs, verified + de-duplicated webhooks, poll fallback,
  hash-chained evidence log (`dd9fb3f`).
- Rebuilt the frontend as a coordinator console plus a public transparency
  page on the existing design system (`dd9fb3f`).
- Added CI, Render blueprint, MIT license, README (`dd9fb3f`, `ecd93e8`).
- Opened PR #1 (`paypal-pivot` → `main`). CI: 4/4 checks passing.

## 2026-10-29

- Agent made provider-switchable: OpenAI or Claude via `AI_PROVIDER`
  (`a1c0f8b`).
- Payout currency made configurable; added peso-scale (PHP) limits because the
  sandbox sender account is Philippine (`818c459`).
- **PayPal sandbox smoke test passed:** OAuth OK → batch `65V9427H8PGJU` →
  item `9FA83ZQEYND2S` SUCCESS, transaction `4YR11970RC554420N` (₱1.00).
- First live OpenAI run failed: gpt-5.5 rejects function tools with reasoning
  on Chat Completions. Moved the adapter to the Responses API (`5fb52af`).
- **Live agent run passed** (gpt-5.5, Typhoon Dalisay Bulletin #8): 9 signal
  areas read, 16 families checked, 13 payouts drafted for ₱39,500, 3 skipped
  with reasons (1 suspended, 2 under Signal 1). 27 s, ~15.5k tokens.
- Approve button did nothing in an embedded browser: native `confirm()` was
  suppressed. Replaced with an in-page confirmation panel (`8f8ad6d`).
- Tests: 14/14 passing (policy, PHP limits, hash chain, OpenAI adapter,
  end-to-end flow).

## Next

- Approve the Dalisay run and confirm payouts land (Refresh from PayPal).
- Run the tampered-bulletin guardrail demo.
- Deploy to Render, register the PayPal webhook, set `PAYPAL_WEBHOOK_ID`.
- Before Dec 1: AI key valid through judging (ends Dec 15).
