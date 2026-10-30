# Development log

What was built for the PayPal AI Hackathon, when, and how it was verified.
All work is after Oct 1, 2026. Times are Manila (UTC+8).

## Where things stand (Oct 30)

- **Live:** https://celerity-relief.vercel.app (PayPal sandbox, PHP). `main` deploys
  production automatically on Vercel; state is in Neon Postgres.
- **The flow matches the original Celerity deck:** Fund → Trigger → Settle →
  Cash out → Proof.
  - **Fund:** funders pay into earmarked pools with PayPal Checkout.
  - **Trigger:** an AI agent drafts payouts from a typhoon bulletin, within hard
    policy limits.
  - **Settle:** a coordinator approves, and each payout is split pro-rata across
    the pools that cover the family.
  - **Cash out:** PayPal Payouts sends the money.
  - **Proof:** a hash-chained evidence log, a public per-funder ledger, and a
    private phone page for each farmer.
- **Tests:** 58/58 server tests; CI green.
- **Production database:** reset to the clean demo seed (16 families, 3
  bulletins, 2 funding pools, no runs).

## 2026-10-28

- Removed the legacy payment and trigger layer, recipient wallet app, Vercel
  functions, and old docs/screenshots (`a55e623`).
- Built `server/` (Node 24, Express 5) (`a55e623`):
  - LLM agent with five strict-schema tools.
  - Policy engine: signal minimum, per-family / per-run / recipient caps, no
    repeat payment per storm.
  - Coordinator approval.
  - PayPal Payouts with idempotent batch IDs.
  - Verified and de-duplicated webhooks, with a poll fallback.
  - Hash-chained evidence log.
- Rebuilt the frontend as a coordinator console plus a public transparency
  page on the existing design system (`a55e623`).
- Added CI, MIT license, README (`a55e623`, `f7bae16`).

## 2026-10-29

- Agent made provider-switchable: OpenAI or Claude via `AI_PROVIDER`
  (`a7f0d30`).
- Payout currency made configurable; added peso-scale (PHP) limits because the
  sandbox sender account is Philippine (`03a1a21`).
- **PayPal sandbox smoke test passed:** OAuth OK → batch `65V9427H8PGJU` →
  item `9FA83ZQEYND2S` SUCCESS, transaction `4YR11970RC554420N` (₱1.00).
- First live OpenAI run failed: gpt-5.5 rejects function tools with reasoning
  on Chat Completions. Moved the adapter to the Responses API (`f29e80a`).
- **Live agent run passed** (gpt-5.5, Typhoon Dalisay Bulletin #8):
  - Read 9 signal areas, checked 16 families, drafted 13 payouts for ₱39,500.
  - Skipped 3 with reasons: 1 suspended, 2 under Signal 1.
  - 27 s, ~15.5k tokens.
  - Approved: batch `ZHEP88FB6YTDU`, 13/13 SUCCESS.
- Approve button did nothing in an embedded browser: native `confirm()` was
  suppressed. Replaced with an in-page confirmation panel (`43dc8e6`).
- **Hosting moved to Vercel (free) + Neon Postgres** (`17eea2e`):
  - The server is now stateless per request, and every write takes a
    `SELECT … FOR UPDATE` row lock.
  - Render was dropped because its free tier sleeps and wipes data.
  - Added `.vercelignore` so secrets never upload (`60ad53c`).
  - The store now re-seeds when its row is reset on a warm instance (`a07787e`).
- **Live on Vercel:** an agent run in production drafted 13 families for
  ₱39,500 in ~24 s. PR #1 merged (`e6a2026`).
- **PayPal webhook registered** (`07J58355TN573983Y`):
  - Three real signed events from a ₱1 sandbox payout were verified and
    accepted.
  - Forged requests get 400.
  - Forged and unrelated events no longer reach the public log (`3efee8c`).
- **Full QA pass** (API probes, code and security review, browser at
  375/1280 px, read-only production checks):
  - Found 31 issues: 4 high, 14 medium, 13 low.
  - Browser health 92/100; API 25/30 checks passed.
  - The tampered-bulletin guardrail held.
- **All 31 fixed in PR #2** (`72dc0be`), tests 21 → 41:
  - **Payouts:** approval no longer holds a DB lock across the PayPal call; a
    lost PayPal answer resumes with the same PayPal-Request-Id instead of
    paying twice; 20 s PayPal timeouts (`dffb08e`).
  - **Privacy:** the public log is an allow-list per event type; PayPal error
    details are never stored (`dffb08e`).
  - **Policy:**
    - Storm-name normalization and a 7-day per-family cooldown.
    - Agent areas must appear in the bulletin, and the bulletin is escaped in
      the prompt.
    - 240 s run deadline.
    - Payout statuses only move forward, and money is summed in centavos
      (`5244327`).
  - **Hardening:** generic 5xx errors, wrong-key throttling, CDN caching of the
    public view, old webhooks refused, shared-email warning, jsonb-safe strings
    (`791e904`).
  - **UI:**
    - The public page is the landing page, and a wrong key shows inline on
      sign-in.
    - Tables become cards on phones.
    - Peso amounts everywhere, plus accessibility fixes (`74aefee`).
  - **Deploy:** immutable asset caching, real 404s, robots.txt, share preview
    image (`5f2d8bd`).
- Side nav pinned while the page scrolls (PR #3, `af7d4ba`).
- **Fund step: funders, earmarked pools, PayPal Checkout** (PR #4, `cb70a19`):
  - Funders pay into pools from the public page (Orders v2).
  - A pool is credited once, only for a completed capture, via the return
    redirect or the `PAYMENT.CAPTURE.COMPLETED` webhook.
  - Payouts are split pro-rata across the pools covering each family.
  - The agent is refused drafts the pools can't cover.
  - The public page shows each funder's ledger (`68a2a91`, `dea899e`).
  - Tests 52/52.
  - **Verified with the real PayPal sandbox:**
    - A one-family run (Bato, Catanduanes, ₱1,750) split ₱1,093.75 PCIC /
      ₱656.25 Global Rice; batch `58CMP3TYR5DJU`, delivered.
    - A ₱500 Checkout by a sandbox buyer credited the PCIC pool once (capture
      `98H24196MF341870R`).

## 2026-10-30

- **Farmer phone page** (PR #5, `c3e7c0b`):
  - **Private link:** each family gets an unguessable link (simulated SMS in
    Tagalog and English) (`63bd2c4`).
  - **The page** (`32e6949`):
    - Phone-first and Tagalog-first.
    - The amount and storm.
    - An Approved → Sent → Received stepper that updates live.
    - Bulletin-to-money minutes next to the old 5-month cheque.
    - Which funders paid.
    - How to cash out to GCash or a bank.
  - **Privacy:** the link shows only that family's own sent payouts; a wrong
    link gets a generic 404, and guessing is throttled.
  - **Console:** shows each payout's SMS, with Copy link / Open as farmer.
  - Tests 58/58.
  - **Verified locally with a real sandbox payout:** Ramon Villanueva's page
    went to "Natanggap mo" (Received) on its own when PayPal confirmed
    delivery.
- Production verified after each merge, then the DB was reset to the clean
  demo seed. All 16 families have private links, and none appear on the
  public pages.

## Next

- **Make the repo public** (hackathon rule).
- **Record the demo video** (YouTube, under 3 minutes):
  1. Fund a pool through Checkout.
  2. Run the Dalisay bulletin.
  3. Show the tampered-bulletin guardrail.
  4. Approve the run.
  5. Show the farmer's phone flipping to "Natanggap mo".
  6. Show the public per-funder ledger.
  - Check the sandbox Business balance first: the full Dalisay run is about
    ₱39,500.
- **RSBSA farmer registry** (next on the roadmap):
  - Farmers with an RSBSA number, crop and farm size.
  - A CSV import for lists that companies request from the Department of
    Agriculture.
- **AI key valid through judging** (ends Dec 15). The current OpenAI key
  expires around Nov 28.
- **Optional:** branch protection on `main`, since every push deploys
  production.
