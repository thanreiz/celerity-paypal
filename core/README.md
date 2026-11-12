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

- `node server/scripts/export-contracts.mjs` runs the Node rules over 56 cases per currency and writes the inputs and answers to `contracts/fixtures/`.
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

## Deploy free on Render (no card)

`render.yaml` at the repo root describes the service. You need a Render account and about 10 minutes.

1. **Sign in.** Go to https://dashboard.render.com and sign in with **GitHub** (the account that owns the repo).
2. **Create the service.** Choose **New → Blueprint** and pick `celerity-paypal`.
   - If the repo isn't listed, click **Configure GitHub** and give Render access to it.
   - Use the branch where `core/` lives (`main` once the Java core PR is merged).
3. **Enter the token.** Render asks for `CORE_TOKEN`. Paste the contents of the local file `.core-token` from the repo root (`cat .core-token`).
   - The file is git-ignored; the same value is already set on Vercel.
4. **Deploy.** Click **Apply**.
   - The first build takes about 5–10 minutes.
   - When it shows **Live**, copy the service URL, for example `https://celerity-core.onrender.com`.
5. **Check it.** `curl <service URL>/actuator/health` should print `"status":"UP"`.
   - On the free plan the first request after 15 idle minutes takes about a minute.
6. **Connect.** Set `CORE_URL` (the service URL) and `CORE_MODE=shadow` on the Vercel project, then redeploy.

The free plan sleeps when idle. In `shadow` mode that's harmless: the web app decides every payout, and a call to a sleeping core just times out after 3 seconds and logs `core shadow call failed`.

## Deploy to Google Cloud Run

Takes about 15 minutes, once. You do steps 1–4, which need your Google account and a browser. Steps 5–6 can then run from this machine.

### 1. Create a Google Cloud project
1. Go to https://console.cloud.google.com and sign in with your Google account.
2. Accept the terms if asked.
3. At the top, open the project picker → **New project**.
   - **Name:** `celerity-core`.
   - Leave the organization as "No organization".
4. Click **Create**, then select the new project.
5. Write down its **Project ID** (shown under the name, for example `celerity-core-123456`).

### 2. Turn on billing
Cloud Run's free tier still needs a billing account attached. It is enough for this service, which scales to zero when idle.
1. Go to https://console.cloud.google.com/billing → **Create account** (or **Link a billing account**) and add a card.
   - New accounts usually get free trial credit.
2. Make sure the `celerity-core` project is linked to it: **Billing → Account management → Projects**.
3. Recommended: **Billing → Budgets & alerts → Create budget** of about $1, with email alerts at 50% and 100%.
   - You'll hear about it long before anything is charged.

**No card?** Use Render instead (next section) and skip the rest of this one.

### 3. Install the gcloud CLI (macOS)
In Terminal:

```bash
curl https://sdk.cloud.google.com | bash
```

- Press Enter to accept the defaults and answer `Y` to update your shell profile.
- Then close and reopen Terminal (or run `exec -l $SHELL`).
- Check it worked: `gcloud --version`.

### 4. Sign in and pick the project

```bash
gcloud init
```

1. Choose **Log in with a new account**. A browser opens; sign in with the same Google account and click **Allow**.
2. Pick the `celerity-core` project.
3. If asked for a default region, choose `asia-southeast1` (Singapore).

### 5. Deploy

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
CORE_TOKEN=$(openssl rand -hex 24)
gcloud run deploy celerity-core \
  --source core \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --memory 512Mi \
  --set-env-vars CORE_TOKEN=$CORE_TOKEN,PAYOUT_CURRENCY=PHP
```

- Run it from the repo root.
- If it asks to create an Artifact Registry repository, answer `Y`.
- About 3–5 minutes later it prints a **Service URL** like `https://celerity-core-xxxx.asia-southeast1.run.app`.
- `--allow-unauthenticated` only opens the network path; every `/v1` call still needs the token.

Check it: `curl <Service URL>/actuator/health` should print `"status":"UP"`.

### 6. Connect the web app (Vercel)
Add three environment variables to the Vercel project (Production), then redeploy:

| Name | Value |
| --- | --- |
| `CORE_URL` | the Service URL |
| `CORE_TOKEN` | the same token as step 5 (`echo $CORE_TOKEN`) |
| `CORE_MODE` | `shadow` |

In `shadow` mode the web app still decides every payout and only compares answers with the core. Mismatches appear in the Vercel logs as `core shadow mismatch`. Switch to `on` once the logs stay clean.
