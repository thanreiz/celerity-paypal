# Celerity core (Java)

The deterministic money rules, as a small stateless service.

- **Java decides.** Same input, same answer, every time: eligibility, payout caps, the pro-rata split across funders' pools, the evidence chain, and reading the wind signals out of a routine PAGASA bulletin.
- **AI agents (in `server/`) handle only what rules can't:** storm changes, field reports, and farmers' messages.
- **No AI, no money, no state here.** The core never calls an AI model, never moves money, and stores nothing. The Node server sends the slice of state a rule needs and gets the answer back.

## Run it

Needs Java 21. The Maven wrapper downloads Maven itself.

```bash
cd core
CORE_TOKEN=dev ./mvnw spring-boot:run     # http://localhost:8081
./mvnw verify                             # unit tests + ParityTest
```

| Endpoint (POST, header `x-core-token`) | Body | Answer |
| --- | --- | --- |
| `/v1/policy/check-draft` | `{state, run, draft}` | `{errors[]}` |
| `/v1/policy/eligibility` | `{state, family_id, run}` | `{eligible, max_amount, signal, reasons[]}` |
| `/v1/policy/run-totals` | `{run}` | `{recipients, amount}` |
| `/v1/funding/allocate` | `{state, run}` | `{allocations, shortfalls}` |
| `/v1/funding/balances` | `{state}` | `{pool_id: {contributed, committed, available}}` |
| `/v1/ledger/verify` | `{events}` | `{ok, length, head}` or `{ok: false, brokenAt, reason}` |
| `/v1/bulletins/parse` | `{text}` | `{storm, bulletin_number, areas[], unparsed[], confidence}` |

Notes:

- Every body may also carry `currency` (`USD` or `PHP`; defaults to `PAYOUT_CURRENCY`) and `now` (an ISO instant, for reproducible answers).
- `state` is `{families, batches, pools, contributions}`.
- `GET /actuator/health` is open for health checks.

## Same answers as Node

The rules were written in Node first (`server/src/policy.js`, `funding.js`, `store.js`). Every rule here is a direct port, and the two are held together by **contract fixtures**:

- `node server/scripts/export-contracts.mjs` runs the Node rules over 38 cases per currency and writes the inputs and answers to `contracts/fixtures/`.
- `ParityTest` replays every fixture in Java and fails on any difference, down to the message text and the centavo.
- `server/test/contracts.test.js` fails if a Node rule changes without regenerating the fixtures.

The bulletin parser is new and has no Node counterpart; `BulletinParserTest` covers it. What it can't place goes to `unparsed` and lowers `confidence`: that is where an AI agent takes over.

## Connect the Node server

| Env (on the Node server) | |
| --- | --- |
| `CORE_URL` | e.g. `https://celerity-core-xxxx.a.run.app` |
| `CORE_TOKEN` | the same secret the core has |
| `CORE_MODE` | `off` (default), `shadow` (Node decides, core is compared and differences are logged), `on` (core decides; Node's rules answer if it's unreachable) |

Start with `shadow` on real traffic, check the logs for `core shadow mismatch`, then switch to `on`.

## Deploy to Google Cloud Run

One-time setup, from a machine with the [gcloud CLI](https://cloud.google.com/sdk/docs/install) signed in to your Google Cloud project:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud run deploy celerity-core \
  --source core \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --memory 512Mi \
  --set-env-vars CORE_TOKEN=<a long random secret>,PAYOUT_CURRENCY=PHP
```

- `--source core` builds `core/Dockerfile` on Cloud Build. No local Docker is needed.
- `--allow-unauthenticated` only opens the network path; every `/v1` call still needs `x-core-token`.
- Then set `CORE_URL`, `CORE_TOKEN` and `CORE_MODE=shadow` on the Vercel project and redeploy.
- With `--min-instances 0` it scales to zero when idle, which keeps it within the free tier. The first call after a quiet period takes a few seconds; in `shadow` mode that never delays a payout.
