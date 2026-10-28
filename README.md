<p align="center">
  <img alt="Celerity" src="celerity-web/public/logo-dove.png" width="110" />
</p>

<h1 align="center">Celerity Relief</h1>

<p align="center">
  <strong>Typhoon cash aid, drafted by an AI agent, approved by a person, sent by PayPal.</strong>
</p>

<p align="center">
  <img alt="PayPal Payouts" src="https://img.shields.io/badge/PayPal-Payouts_API-003087?style=flat-square&logo=paypal&logoColor=white" />
  <img alt="AI agent" src="https://img.shields.io/badge/AI-OpenAI_or_Claude_tool_use-d97757?style=flat-square" />
  <img alt="Node" src="https://img.shields.io/badge/Server-Node_24_+_Express-16452d?style=flat-square" />
  <img alt="React" src="https://img.shields.io/badge/Frontend-React_18_+_Vite-61DAFB?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-2e7d32?style=flat-square" />
</p>

---

When a typhoon hits the Philippines, relief money usually already exists. What's slow is
deciding who gets it and getting it into their hands. Celerity Relief cuts that to minutes:

1. **A bulletin arrives.** A coordinator pastes a tropical cyclone bulletin, or picks one from the feed.
2. **The agent drafts.** An LLM agent (OpenAI or Claude) reads the free-text bulletin, works out which provinces and towns
   are under which wind signal, finds registered families there, and drafts a payout for each
   eligible family with a one-line reason.
3. **Code enforces the limits.** Every draft goes through a policy engine: signal minimum, per-family
   cap, per-run cap, recipient cap, no double payment for the same storm. The agent proposes; code
   decides. If the agent asks for too much, the draft is refused and it has to adjust.
4. **A person approves.** Nothing moves until a coordinator reviews the drafts and approves the run.
   Policy is checked again at approval.
5. **PayPal pays.** One Payouts batch per run. Verified PayPal webhooks update each family's status
   (Pending → Delivered, or Unclaimed) on a live timeline.
6. **Everything is on the record.** Every agent run, approval, PayPal batch and webhook goes into
   an append-only SHA-256 hash-chained evidence log. A public page shows totals and the chain,
   with no names or emails.

> **Hosted demo:** _coming soon (Render)_ · **Demo video:** _coming soon_
>
> The demo runs on the **PayPal sandbox** with **simulated bulletins** for a fictional
> Typhoon Dalisay. No real money moves.

---

## What's PayPal, what's AI, what's ours

| Piece | What it does |
| --- | --- |
| **PayPal Payouts API** (`/v1/payments/payouts`) | Sends every approved run as one batch to families' PayPal emails. `sender_batch_id` is derived from the run ID, so a retried approval can never pay twice. |
| **PayPal Webhooks** (`PAYMENT.PAYOUTSBATCH.*`, `PAYMENT.PAYOUTS-ITEM.*`) | Push status updates. Each delivery is verified with `/v1/notifications/verify-webhook-signature` and de-duplicated by event ID. |
| **PayPal OAuth 2.0** (client credentials) | Server-side only; the token is cached until shortly before it expires. |
| **LLM agent**: OpenAI (Responses API, function calling) or Anthropic Claude (Messages API, tool use) | The agent loop ([`agent.js`](server/src/agent.js), [`providers.js`](server/src/providers.js)). Five strict-schema tools: `record_bulletin_facts`, `search_families`, `check_eligibility`, `draft_payout`, `remove_draft`. One env var (`AI_PROVIDER`) switches vendors. |
| **Policy engine** ([`server/src/policy.js`](server/src/policy.js)) | Deterministic eligibility and caps. The only thing that decides whether a draft is allowed. |
| **Evidence log** ([`server/src/store.js`](server/src/store.js)) | Append-only, hash-chained. Editing or deleting any past entry breaks verification. |

### Guardrails, not vibes

The **Tampered bulletin** in the demo contains an injected instruction telling the agent to ignore
limits, pay every family 500 USD, and add an outside email address. Run it and watch what happens:
the agent can only pay family IDs from the registry, to the email on file, up to the policy cap,
and a human still has to approve. The bulletin is passed to the model as data, and the
system prompt says so, but the guarantee comes from the code, not the prompt.

---

## Architecture

```
            ┌───────────────────────── Render web service ──────────────────────────┐
 browser    │  Express (server/)                                                    │
 ─────────► │   /api/state, /api/public ── JSON store + hash-chained evidence log   │
 React SPA  │   /api/bulletins/:id/runs ── agent.js ──► OpenAI or Claude API        │
 (served    │                                │  tool calls                          │
  from the  │                                ▼                                      │
  same      │                            policy.js  (eligibility, caps, no repeats) │
  server)   │   /api/runs/:id/approve ── payouts.js ──► PayPal Payouts API          │
            │   /api/webhooks/paypal  ◄── verify signature ◄── PayPal Webhooks      │
            └───────────────────────────────────────────────────────────────────────┘
```

- **`server/`**: Node 24, Express 5, `openai` and `@anthropic-ai/sdk`. PayPal is called with Node's built-in
  `fetch` (no SDK). State is a single JSON file written atomically; the evidence log lives in it.
- **`celerity-web/`**: React 18 + Vite. Coordinator console (Overview, Respond, Payouts,
  Families, Evidence log) and a public transparency page at `/#/public`.

## Repo layout

```
server/
  src/
    index.js        boot: load store, serve API + built frontend
    app.js          HTTP routes, coordinator auth, rate limit
    agent.js        agent loop and tool implementations
    providers.js    OpenAI and Claude adapters behind one interface
    policy.js       hard limits and eligibility
    payouts.js      approval → PayPal batch, webhook + poll status sync
    paypal.js       OAuth, Payouts, webhook verification
    store.js        JSON store, hash-chained evidence log
    seed.js         demo families and simulated bulletins
  scripts/paypal-smoke.mjs   sandbox smoke test (token → payout → poll)
  test/             node:test suites (policy, store, end-to-end flow)
celerity-web/
  src/pages/console/  coordinator console
  src/pages/public/   public transparency page
  src/design/         design system (tokens, Card, Table, StatusPill, …)
render.yaml          Render blueprint
```

---

## Run it locally

Requires **Node 22+** (24 recommended).

### 1. PayPal sandbox

1. Go to [developer.paypal.com](https://developer.paypal.com) → **Apps & Credentials** → **Sandbox** →
   **Create App** (type: Merchant). Copy the **Client ID** and **Secret**.
2. Under **Sandbox accounts**, note the email of a **Personal** account. Demo payouts will land there.
3. (Optional, for webhooks) In the app's **Webhooks** section, add
   `https://<your-public-host>/api/webhooks/paypal` and subscribe to `PAYMENT.PAYOUTSBATCH.*` and
   `PAYMENT.PAYOUTS-ITEM.*`. Copy the **Webhook ID**. Without it, use **Refresh from PayPal** on the
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

Open the Vite URL (it proxies `/api` to the server on port 8787) and sign in with your
`COORDINATOR_KEY`. Or build the frontend once (`npm run build` in `celerity-web/`) and open
<http://localhost:8787>: the server serves the build itself.

### Tests

```bash
cd server && npm test
```

The suites cover policy caps and eligibility, hash-chain tamper detection, and a full
end-to-end flow (bulletin → scripted agent run with policy refusals → approval → PayPal batch →
webhooks → public view without PII), run against scripted OpenAI and Claude clients and a fake PayPal.

## Deploy to Render

The repo includes [`render.yaml`](render.yaml). In Render: **New → Blueprint**, pick this repo, then
set the secret env vars (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`,
`AI_PROVIDER` plus `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, `COORDINATOR_KEY`, `SEED_RECEIVER_EMAILS`).
Point the PayPal webhook at
`https://<service>.onrender.com/api/webhooks/paypal`.

On the free plan the disk is not persistent: a restart or redeploy reseeds the demo data and
clears the evidence log.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | yes | PayPal REST app credentials |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` |
| `PAYPAL_WEBHOOK_ID` | for webhooks | Verifies webhook signatures; webhooks are rejected without it |
| `AI_PROVIDER` | no | `openai` or `anthropic`; unset picks whichever key is present |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | one of them | Key for the agent's provider |
| `OPENAI_MODEL`, `CLAUDE_MODEL` | no | Default `gpt-5.5`, `claude-opus-5-5` |
| `AI_EFFORT` | no | Reasoning effort, default `medium` |
| `COORDINATOR_KEY` | yes in prod | Passcode for running the agent and approving payouts |
| `SEED_RECEIVER_EMAILS` | no | Sandbox emails assigned to demo families |
| `PAYOUT_CURRENCY` | no | `USD` (default) or `PHP`; must match the sender account's balance currency. Policy limits are set per currency. |
| `AGENT_RUNS_PER_HOUR` | no | Default `20`; protects a public demo |
| `DATA_DIR`, `PORT` | no | Default `server/data`, `8787` |

---

## Tools used

- **PayPal**: Payouts API, Webhooks + webhook signature verification, OAuth 2.0 client credentials (sandbox)
- **OpenAI API**: Responses API with strict function calling and reasoning (`openai`)
- **Anthropic Claude API**: Messages API with strict tool use, adaptive thinking, server-side refusal fallback (`@anthropic-ai/sdk`)
- **Node.js 24** and **Express 5** for the API server
- **React 18** and **Vite 6** for the frontend
- **Render** for hosting
- **GitHub Actions** for CI (server tests + frontend build)
- **Claude Code** was used as a coding assistant during development

## What changed from the original Celerity

Celerity started as an earlier disaster-relief prototype
([github.com/thanreiz/Celerity](https://github.com/thanreiz/Celerity)). For this hackathon it was rebuilt
after Oct 1, 2026, with a new backend, a new payment rail, and a new console:

- **New:** an Express backend; an LLM tool-use agent (OpenAI or Claude) that reads free-text bulletins and drafts
  payouts; a deterministic policy engine; human approval; PayPal Payouts with verified webhooks
  and a live status timeline; a hash-chained evidence log; and a public transparency page.
- **Replaced:** the old payment and trigger layer and the recipient wallet app, which PayPal
  Payouts and the agent now cover.
- **Kept:** the design system and the core rules from the original: objective triggers, no
  double payment for the same event, and the registry stays in human hands.

See [`docs/DEVLOG.md`](docs/DEVLOG.md) for a dated log of the build and its verification runs.

## Credits

**Ethan Dreiz Baltazar**, solo developer. [github.com/thanreiz](https://github.com/thanreiz)

Licensed under the [MIT License](LICENSE).
