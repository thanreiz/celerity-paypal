<p align="center">
  <img alt="Celerity" src="celerity-web/public/logo-dove.png" width="110" />
</p>

<h1 align="center">Celerity Relief</h1>

<p align="center">
  <strong>Typhoon cash aid: funders cash in and farmers cash out through PayPal; rules decide what they can, AI agents handle what they can't.</strong>
</p>

<p align="center">
  <img alt="PayPal Checkout" src="https://img.shields.io/badge/PayPal-Checkout_(Orders_v2)-003087?style=flat-square&logo=paypal&logoColor=white" />
  <img alt="PayPal Payouts" src="https://img.shields.io/badge/PayPal-Payouts_API-003087?style=flat-square&logo=paypal&logoColor=white" />
  <img alt="AI agent" src="https://img.shields.io/badge/AI-OpenAI_or_Claude_tool_use-d97757?style=flat-square" />
  <img alt="Node" src="https://img.shields.io/badge/Server-Node_24_+_Express-16452d?style=flat-square" />
  <img alt="React" src="https://img.shields.io/badge/Frontend-React_18_+_Vite-61DAFB?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-2e7d32?style=flat-square" />
</p>

---

When a typhoon hits the Philippines, relief money usually already exists. What's slow is
deciding who gets it and getting it into their hands. Celerity keeps the shape of the original
[Celerity](https://github.com/thanreiz/Celerity), two apps around one decision-making backend,
with PayPal at both edges and AI agents only where rules can't decide:

```
 PayPal ⇄ Farmer app ⇄  Celerity: rules + AI agents  ⇄ Funder app ⇄ PayPal
 cash out (Payouts)       decides who, how much, when          cash in (Checkout)
```

- **Funder app** (`#/funder`). An insurer or foundation signs in, sees only its own pools, and
  cashes in with **PayPal Checkout**. In the demo, sign-in is a picker of two demo institutions;
  set `DEMO_FUNDERS=0` and `FUNDER_CODES` to require an access code per funder. It describes a pool in plain words ("rice farmers in Bicol
  at Signal 3 or higher"); the **pool-rule agent** turns that into a rule, and code checks it
  (real provinces, a signal the program allows) before the pool exists. Whatever the code
  can't enforce (crops, installments) is shown to the funder as not enforced. Every release is
  traced to the towns it reached.
- **Celerity** (the backend). Code decides wherever the answer must be the same every time:
  - A routine PAGASA bulletin is read by a **parser with no AI** (Java core, with a Node port held
    to the same answers). Policy picks every eligible family and its amount, funders' pools cover
    it pro-rata, and the payouts go to **PayPal Payouts** at once. No AI touched it, so no one has
    to approve it. The parser only calls a bulletin routine when it read every line of every
    signal block: part of a province with no towns named, a lifted or lowered signal, or a line
    it can't read all go to AI and a person instead.
  - What the parser can't place goes to **Jev**, TypeSafe AI's System One model: fast (~0.3 s)
    typed decisions with calibrated probabilities. Jev picks which province each leftover phrase
    means (only among provinces the bulletin names) and whether it covers the whole province. If
    every phrase is a whole province at 95%+, the rules draft the payouts and a coordinator
    approves ("Rules + Jev"): an AI judgment decided where the money goes, so a person signs off.
  - Anything still uncertain ("the Caramoan Peninsula", "the northern half of Sorsogon": parts of
    provinces) goes to the **relief agent** (GPT-5.5 or Claude) with Jev's guesses as context. It
    drafts within the same hard limits, and a coordinator approves before money moves.
  - Jev also checks every bulletin for instructions aimed at software. The tampered demo bulletin
    scores 99%, so even its rules-only run waits for a person. If Jev is switched on but doesn't
    answer, the run waits for a person too. Without a TypeSafe key there is no such check: the
    parser still never reads text outside the signal blocks, so the injected line has nothing to
    act on.
- **Farmer app** (`#/farmer`, or the private link `#/r/<token>` from the SMS). The original phone
  app, in Tagalog or English: what arrived, whether the storm over their town qualifies them
  (the rules' answer), how to move it from PayPal to GCash, and a **helper agent** (GPT-5.5) that
  answers from that farmer's own record and can open a case for a coordinator. Jev triages each
  message first: a damage report or wrong details opens a case even if GPT doesn't. Neither can
  move money.
- **Everything is on the record.** Every run (rules or agent), approval, PayPal batch, webhook and
  farmer case goes into an append-only SHA-256 hash-chained evidence log, with a public page.

**Three layers:** GPT-5.5 writes and reads open text; Jev makes fast fuzzy decisions with a
confidence; the money rules (Node, held to the Java core by `contracts/fixtures`) decide caps,
eligibility, the split across pools and no double payment, and check every AI output before money
moves. Only a run no AI touched goes on the automatic path; anything Jev placed or the agent
drafted goes to a person. Set `AUTO_RELEASE=0` to have a coordinator approve every run. Without a TypeSafe key, Jev is skipped
and the parser + GPT agent + coordinator path works as before.

> **Hosted demo:** https://celerity-relief.vercel.app (PayPal sandbox; coordinator key shared with judges in the submission) · **Demo video:** _coming soon_
>
> The demo runs on the **PayPal sandbox** with **simulated bulletins** for a fictional
> Typhoon Dalisay. No real money moves.

---

## What's PayPal, what's AI, what's ours

| Piece | What it does |
| --- | --- |
| **PayPal Checkout** (Orders v2: `/v2/checkout/orders`, `/capture`) | How funders put money into a pool, from the public page. The pool is credited only when PayPal reports a completed capture of the chosen amount, from the return redirect or the `PAYMENT.CAPTURE.COMPLETED` webhook, once. |
| **PayPal Payouts API** (`/v1/payments/payouts`) | Sends every approved run as one batch to families' PayPal emails. `sender_batch_id` is derived from the run ID, so a retried approval can never pay twice. |
| **PayPal Webhooks** (`PAYMENT.PAYOUTSBATCH.*`, `PAYMENT.PAYOUTS-ITEM.*`, `PAYMENT.CAPTURE.*`) | Push status updates, and take a refunded or reversed contribution back out of its pool. Each delivery is verified with `/v1/notifications/verify-webhook-signature` and de-duplicated by event ID. |
| **PayPal OAuth 2.0** (client credentials) | Server-side only; the token is cached until shortly before it expires. |
| **Pool-rule and helper agents** ([`agents.js`](server/src/agents.js)) | The Funder app's agent turns a funder's words into a pool rule (`registry_coverage`, `propose_pool`, checked by [`funders.js`](server/src/funders.js)). The Farmer app's agent answers from one farmer's record (`get_my_payouts`, `get_my_registration`, `get_storm_status`, `open_case`). Neither can move money. |
| **Jev** ([`jev.js`](server/src/jev.js)), TypeSafe System One API (`POST /v1/systemone`) | Places bulletin phrases the parser couldn't read, flags injected instructions, triages farmer messages. Every answer is checked in code; any failure falls back. |
| **Rules path** ([`parser.js`](server/src/parser.js), [`rules.js`](server/src/rules.js)) | Reads routine bulletins without AI and drafts by policy alone; Node port of the Java parser, both held to `contracts/fixtures`. |
| **LLM agent**: OpenAI (Responses API, function calling) or Anthropic Claude (Messages API, tool use) | The agent loop ([`agent.js`](server/src/agent.js), [`providers.js`](server/src/providers.js)). Five strict-schema tools: `record_bulletin_facts`, `search_families`, `check_eligibility`, `draft_payout`, `remove_draft`. One env var (`AI_PROVIDER`) switches vendors. |
| **Policy engine** ([`server/src/policy.js`](server/src/policy.js)) | Deterministic eligibility and caps. The only thing that decides whether a draft is allowed. |
| **Funding pools** ([`server/src/funding.js`](server/src/funding.js)) | Earmarked pools over the one PayPal balance. Splits every payout pro-rata across the pools that cover the family; refuses drafts the pools can't cover. Balances are computed from the record, never stored. |
| **Evidence log** ([`server/src/store.js`](server/src/store.js)) | Append-only, hash-chained. Editing or deleting any past entry breaks verification. |

### Guardrails, not vibes

The **Tampered bulletin** in the demo contains an injected instruction telling the agent to ignore
limits, pay every family 500 USD, and add an outside email address. Run it and watch what happens:
the agent can only pay family IDs from the registry, to the email on file, up to the policy cap,
and a human still has to approve. The bulletin is passed to the model as data, and the
system prompt says so, but the guarantee comes from the code, not the prompt.

More of what the code enforces, whatever the model says:

- Every area the agent records must name a province that appears in the bulletin text, by its whole
  name ("Eastern Samar" doesn't name Samar), and never at a higher signal than the parser read for it.
- Jev's answers are checked before use: a probability outside 0 to 1, or a province that wasn't
  offered, counts as no answer.
- A family paid in the last 7 days can't be drafted again under any storm name.
- Approval never holds a database lock while PayPal is called. If PayPal's answer is lost, the batch
  stays "sending" and Approve resumes it with the same PayPal-Request-Id, so nothing is paid twice.
- The public page shows an allow-list of fields per event: no emails, names, family IDs or error payloads.

**Limits.** The evidence chain proves the log wasn't edited after the fact by anyone who doesn't
also control the database; anchoring its head hash outside the app is future work. Wrong-key
throttling is per serverless instance. `/api/config` is public on purpose, so anyone can read the
payout policy.

---

## Architecture

```
            ┌──────────────── Vercel: one serverless function (api/index.js) ───────┐
 browser    │  Express (server/)                                                    │
 ─────────► │   /api/state, /api/public ── Neon Postgres: state + hash-chained log  │
 React SPA  │   /api/bulletins/:id/runs ── agent.js ──► OpenAI or Claude API        │
 (static,   │        (runs after the 202 │  tool calls                          │
  served by │         via waitUntil)     ▼                                      │
  Vercel)   │                            policy.js  (eligibility, caps, no repeats) │
            │   /api/runs/:id/approve ── payouts.js ──► PayPal Payouts API          │
            │   /api/webhooks/paypal  ◄── verify signature ◄── PayPal Webhooks      │
            └───────────────────────────────────────────────────────────────────────┘
```

- **`server/`**: Node 24, Express 5, `openai` and `@anthropic-ai/sdk`. PayPal is called with Node's built-in
  `fetch` (no SDK). App state is one JSON document. On Vercel it lives in Neon Postgres and every
  change runs in a transaction holding a row lock, so concurrent requests on different serverless
  instances apply one at a time (no double approvals). Locally it's a JSON file.
- **`celerity-web/`**: React 18 + Vite. Coordinator console (Overview, Funds, Respond, Payouts,
  Families, Evidence log), a public transparency page at `/#/public`, and each farmer's private
  phone page at `/#/r/<link>`.
- **`core/`**: Java 21 + Spring Boot. The deterministic money rules as a stateless service on
  **Render** (Docker, from [`render.yaml`](render.yaml)):
  - eligibility, caps and draft checks;
  - the pro-rata split across funders' pools;
  - hash-chain verification;
  - a PAGASA bulletin parser that reads routine bulletins without AI.

  The Node server can hand approvals to it (`CORE_MODE=shadow|on`). Java and Node are held to
  identical answers by `contracts/fixtures`. See [`core/README.md`](core/README.md).

**The split:** code decides wherever the answer must be the same every time. That covers who
qualifies, how much they get, which funder pays, and whether the record was changed. AI handles
what rules can't: free-text bulletins the parser can't place, storms that change between bulletins,
field reports, and farmers' messages in their own language.

## Repo layout

```
server/
  src/
    index.js        local server: API + built frontend
    app.js          HTTP routes, coordinator / funder / farmer access, rate limits, background agent jobs
    config.js       environment and what /api/config reports
    parser.js       reads routine PAGASA bulletins with no AI (Node port of the Java parser)
    provinces.js    province names and their other spellings
    rules.js        routes a bulletin (rules, Rules + Jev, or agent) and drafts by policy
    jev.js          Jev (TypeSafe System One): placements, injection score, message triage
    agent.js        relief agent loop and tool implementations
    agents.js       pool-rule agent (Funder app) and helper agent (Farmer app)
    providers.js    OpenAI and Claude adapters behind one interface
    policy.js       hard limits and eligibility
    funding.js      pools, PayPal Checkout contributions, pro-rata split
    funders.js      funder accounts and pool-rule checks
    payouts.js      approval → PayPal batch, webhook + poll status sync
    paypal.js       OAuth, Orders, Payouts, webhook verification
    core.js         client for the Java core (CORE_MODE)
    notify.js       the simulated SMS to each family
    store.js        transactional store (Postgres or file), hash-chained evidence log
    storage.js      picks Postgres (DATABASE_URL) or the local file store
    seed.js         demo families, funders and simulated bulletins
  scripts/paypal-smoke.mjs       sandbox smoke test (token → payout → poll)
  scripts/export-contracts.mjs   writes contracts/fixtures from the Node rules
  test/             node:test suites: policy, parser contracts, Jev, agents, funding, approval,
                    webhooks, access, store (incl. Postgres via PGlite), end-to-end flow
celerity-web/
  src/pages/landing/  landing page
  src/pages/funder/   Funder app
  src/pages/farmer/   Farmer app
  src/pages/console/  coordinator console
  src/pages/public/   public transparency page
  src/design/         design system (tokens, Card, Table, StatusPill, …)
core/                Java 21 + Spring Boot: the same money rules and parser as a service
contracts/fixtures/  rule inputs and answers that Node and Java must both give
docs/DEVLOG.md       dated build log
api/index.js         Vercel function entry (wraps the Express app)
vercel.json          Vercel build, rewrites, headers, 300s function limit
render.yaml          Render Blueprint for the Java core
```

---

## Run it locally

Requires **Node 22+** (24 recommended).

### 1. PayPal sandbox

1. Go to [developer.paypal.com](https://developer.paypal.com) → **Apps & Credentials** → **Sandbox** →
   **Create App** (type: Merchant). Copy the **Client ID** and **Secret**.
2. Under **Sandbox accounts**, note the email of a **Personal** account. Demo payouts will land there.
3. (Optional, for webhooks) In the app's **Webhooks** section, add
   `https://<your-public-host>/api/webhooks/paypal` and subscribe to `PAYMENT.PAYOUTSBATCH.*`,
   `PAYMENT.PAYOUTS-ITEM.*` and `PAYMENT.CAPTURE.*` (completed, refunded, reversed, denied). Copy the **Webhook ID**. Without it, use **Refresh from PayPal** on the
   Payouts page to pull status instead.

### 2. Configure

```bash
cp server/.env.example server/.env
```

Fill in `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, an AI key (`OPENAI_API_KEY` with `AI_PROVIDER=openai`, or
`ANTHROPIC_API_KEY`), `COORDINATOR_KEY`, and set
`SEED_RECEIVER_EMAILS` and `SMOKE_RECEIVER_EMAIL` to your sandbox personal account email(s).

### 3. Smoke-test PayPal

```bash
cd server && npm install && npm run smoke
```

This gets an OAuth token, sends one 1.00 payout to `SMOKE_RECEIVER_EMAIL`, and polls the batch
until it succeeds or fails.

### 4. Run

```bash
cd server && npm run dev
```

```bash
cd celerity-web && npm install && npm run dev
```

Open the Vite URL, <http://localhost:5173> (it proxies `/api` to the server on port 8787) and sign in with your
`COORDINATOR_KEY`. Or build the frontend once (`npm run build` in `celerity-web/`) and open
<http://localhost:8787>: the server serves the build itself.

### Tests

```bash
cd server && npm test
```

The suites cover policy caps and eligibility, hash-chain tamper detection, transaction rollback and
concurrent writes on Postgres (PGlite), and a full end-to-end flow (bulletin → scripted agent run with
policy refusals → approval → PayPal batch → webhooks → public view without PII), run on both stores
against scripted OpenAI and Claude clients and a fake PayPal. Others cover lost PayPal answers and
resumed approvals, out-of-order payout statuses, run deadlines, webhook signatures and age, input
validation, and the public allow-list.

## Deploy to Vercel

1. **Import:** on [vercel.com](https://vercel.com) → **Add New → Project** → import this repo. Leave the
   framework preset alone; [`vercel.json`](vercel.json) sets the install, build and output.
2. **Database:** in the project → **Storage** → **Create Database** → **Neon** (free). It adds
   `DATABASE_URL` to the project. The table is created and seeded on the first request.
3. **Environment variables** (Settings → Environment Variables): `PAYPAL_CLIENT_ID`,
   `PAYPAL_CLIENT_SECRET`, `AI_PROVIDER` + `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`),
   `COORDINATOR_KEY`, `SEED_RECEIVER_EMAILS`, `PAYOUT_CURRENCY=PHP`. Then redeploy.
4. **Webhook:** point the PayPal sandbox webhook at `https://<project>.vercel.app/api/webhooks/paypal`
   and add its ID as `PAYPAL_WEBHOOK_ID`.

Agent runs continue after the HTTP response through `waitUntil`, within Vercel's 300-second
function limit (a typical run takes about 30 seconds).

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | yes | PayPal REST app credentials |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` |
| `PAYPAL_WEBHOOK_ID` | for webhooks | Verifies webhook signatures; webhooks are rejected without it |
| `AI_PROVIDER` | no | `openai` or `anthropic`; unset picks whichever key is present (Anthropic if both or neither) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | one of them | Key for the agent's provider |
| `OPENAI_MODEL`, `CLAUDE_MODEL` | no | Default `gpt-5.5`, `claude-opus-5-5` |
| `AI_EFFORT` | no | Reasoning effort, default `medium` |
| `COORDINATOR_KEY` | yes in prod | Passcode for running the agent and approving payouts |
| `SEED_RECEIVER_EMAILS` | no | Sandbox emails assigned to demo families |
| `PAYOUT_CURRENCY` | no | `USD` (default) or `PHP`; must match the sender account's balance currency. Policy limits are set per currency. |
| `AGENT_RUNS_PER_HOUR` | no | Default `20`; protects a public demo |
| `DATABASE_URL` | on Vercel | Postgres connection string (Neon sets it). Without it, state is a local JSON file. |
| `DATA_DIR`, `PORT` | no | Local file store folder and port. Default `server/data`, `8787` |
| `PUBLIC_URL` | off Vercel | Where PayPal Checkout sends funders back, e.g. `https://celerity-relief.vercel.app`. Default: the Vercel URL, or localhost in development |
| `CORE_URL`, `CORE_TOKEN` | no | The Java core (`core/`) and its shared secret |
| `CORE_MODE` | no | `off` (default), `shadow` (Node decides, the core is compared), `on` (the core decides, Node's rules answer if it's unreachable) |
| `TYPESAFE_API_KEY` | no | Jev (TypeSafe AI). Unset: Jev is skipped and the app works as before |
| `TYPESAFE_MODEL` | no | Default `jev-latest` |
| `JEV_PLACE_THRESHOLD` | no | Default `0.95`: how sure Jev must be of a province before the rules use it |
| `AUTO_RELEASE` | no | `1` (default): a bulletin the rules read completely is paid without approval. `0`: a coordinator approves every run |
| `APP_AI_CALLS_PER_HOUR` | no | Default `200`: cap on pool-rule and helper agent calls from the two apps (also 15 per client per hour) |
| `DEMO_FARMERS` | no | `0` hides the seeded demo farmers on the Farmer app's "Is this you?" screen. Never served when `PAYPAL_ENV=live` |
| `DEMO_FUNDERS` | no | `0` makes Funder app sign-in ask for an access code instead of offering the demo picker |
| `FUNDER_CODES` | with `DEMO_FUNDERS=0` | JSON object of funder ID to access code |
| `TRUST_PROXY_HOPS` | no | Behind a proxy other than Vercel: how many proxies set `X-Forwarded-For`. Unset: the socket address is the client |
| `RUN_DEADLINE_MS` | no | How long an agent run may take before it is failed and stopped |
| `TYPESAFE_TIMEOUT_MS` | no | Default `4000`: how long to wait for Jev before falling back |
| `SMOKE_RECEIVER_EMAIL` | for `npm run smoke` | Sandbox personal account that receives the 1.00 smoke payout |

---

## Tools used

- **PayPal**: Checkout (Orders v2), Payouts API, Webhooks + webhook signature verification, OAuth 2.0 client credentials (sandbox)
- **TypeSafe AI**: Jev, the System One model, for fast typed decisions with a confidence (optional)
- **OpenAI API**: Responses API with strict function calling and reasoning (`openai`)
- **Anthropic Claude API**: Messages API with strict tool use, adaptive thinking, server-side refusal fallback (`@anthropic-ai/sdk`)
- **Node.js 24** and **Express 5** for the API server
- **Java 21** and **Spring Boot** for the deterministic rules core
- **React 18** and **Vite 6** for the frontend
- **Vercel** hosts the website: the static frontend and the API as one serverless function
- **Render** hosts the Java core as a Docker web service, described by the [`render.yaml`](render.yaml) Blueprint
- **Neon** serverless Postgres for state (`pg`), tested locally with **PGlite**
- **GitHub Actions** for CI (server tests + frontend build)
- **Claude Code** was used as a coding assistant during development

## What changed from the original Celerity

Celerity started as an earlier disaster-relief prototype
([github.com/thanreiz/Celerity](https://github.com/thanreiz/Celerity)). For this hackathon it was rebuilt
after Oct 1, 2026, with a new backend, a new payment rail, and a new console:

- **New:** an Express backend; an LLM tool-use agent (OpenAI or Claude) that reads free-text bulletins and drafts
  payouts; a deterministic policy engine; human approval; PayPal Payouts with verified webhooks
  and a live status timeline; a hash-chained evidence log; and a public transparency page.
- **Replaced:** the old payment and trigger layer. PayPal Checkout and Payouts now move the money,
  and the Funder and Farmer apps were rebuilt around them.
- **Kept:** the design system and the core rules from the original: objective triggers, no
  double payment for the same event, and the registry stays in human hands.

See [`docs/DEVLOG.md`](docs/DEVLOG.md) for a dated log of the build and its verification runs.

## Credits

**Ethan Dreiz Baltazar**, solo developer. [github.com/thanreiz](https://github.com/thanreiz)

Licensed under the [MIT License](LICENSE).
