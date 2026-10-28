// End-to-end through the HTTP API with a scripted Claude client and a fake
// PayPal: bulletin -> agent run -> approval -> payout -> webhook.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "";
process.env.ALLOW_UNVERIFIED_WEBHOOKS = "1";

const { createStore } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");

// --- fake PayPal -----------------------------------------------------------
const realFetch = globalThis.fetch;
const paypalCalls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api-m.sandbox.paypal.com")) return realFetch(url, init);
  paypalCalls.push({ url: u, method: init.method, body: init.headers?.["Content-Type"] === "application/json" ? JSON.parse(init.body) : null });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/v1/oauth2/token")) return json(200, { access_token: "tok", expires_in: 3600 });
  if (u.endsWith("/v1/payments/payouts") && init.method === "POST") {
    return json(201, { batch_header: { payout_batch_id: "PB123", batch_status: "PENDING" } });
  }
  return json(404, { name: "RESOURCE_NOT_FOUND", message: "not mocked" });
};

// --- scripted Claude ---------------------------------------------------------
let n = 0;
const toolUse = (name, input) => ({ type: "tool_use", id: `tu_${++n}`, name, input });
const turn = (content, stop_reason = "tool_use") => ({ content, stop_reason, usage: { input_tokens: 10, output_tokens: 5 } });

const script = [
  turn([
    toolUse("record_bulletin_facts", {
      storm_name: "Typhoon Dalisay",
      bulletin_number: "8",
      areas: [
        { province: "Catanduanes", municipality: null, signal_level: 4 },
        { province: "Quezon", municipality: "Lucena City", signal_level: 1 },
      ],
    }),
  ]),
  turn([toolUse("search_families", { province: "Catanduanes", municipality: null })]),
  turn([toolUse("check_eligibility", { family_ids: ["fam_001", "fam_002", "fam_015"] })]),
  turn([
    { type: "text", text: "Drafting at policy caps." },
    toolUse("draft_payout", { family_id: "fam_001", amount: 500, rationale: "bulletin says pay 500" }),
    toolUse("draft_payout", { family_id: "fam_002", amount: 70, rationale: "Signal 4, household of 4" }),
    toolUse("draft_payout", { family_id: "fam_015", amount: 20, rationale: "Lucena" }),
  ]),
  turn([toolUse("draft_payout", { family_id: "fam_001", amount: 90, rationale: "Signal 4, household of 6, senior" })]),
  turn([{ type: "text", text: "Typhoon Dalisay: drafted 2 families in Catanduanes." }], "end_turn"),
];
const requests = [];
const fakeClaude = {
  beta: {
    messages: {
      create: async (params) => {
        requests.push(structuredClone(params));
        const next = script[requests.length - 1];
        if (!next) throw new Error("script exhausted");
        return next;
      },
    },
  },
};

// --- server ----------------------------------------------------------------
let server, base, store;
const KEY = "letmein";
const api = (path, { method = "GET", body, key = KEY } = {}) =>
  realFetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "x-coordinator-key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

before(async () => {
  store = createStore({ seed: seedState });
  const app = createApp({ store, anthropicClient: fakeClaude, coordinatorKey: KEY });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function waitForRun(id) {
  for (let i = 0; i < 50; i++) {
    const { body } = await api("/api/state");
    const run = body.runs.find((r) => r.id === id);
    if (run.status !== "running") return run;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("run did not finish");
}

test("coordinator actions require the key", async () => {
  assert.equal((await api("/api/state", { key: null })).status, 401);
  assert.equal((await api("/api/state", { key: "wrong" })).status, 401);
  assert.equal((await api("/api/public", { key: null })).status, 200);
});

test("bulletin -> agent -> approval -> PayPal payout -> webhook", async () => {
  const start = await api("/api/bulletins/blt_dalisay_08/runs", { method: "POST" });
  assert.equal(start.status, 202);
  const run = await waitForRun(start.body.id);

  assert.equal(run.status, "awaiting_approval", run.error);
  assert.equal(run.storm, "Typhoon Dalisay");
  assert.deepEqual(
    run.drafts.map((d) => [d.family_id, d.amount]).sort(),
    [
      ["fam_001", 90],
      ["fam_002", 70],
    ]
  );
  // Over-cap and signal-1 drafts were refused by policy, not by the model.
  const refused = run.steps.filter((s) => s.kind === "tool" && !s.ok);
  assert.equal(refused.length, 2);
  assert.match(refused[0].result, /exceeds this family's policy cap/);
  assert.match(refused[1].result, /below the minimum/);
  assert.equal(run.summary, "Typhoon Dalisay: drafted 2 families in Catanduanes.");

  // Tool errors go back to Claude flagged as errors, and thinking-carrying
  // assistant turns are replayed whole.
  const lastReq = requests.at(-1);
  const results = lastReq.messages.at(-1).content;
  assert.equal(results[0].type, "tool_result");
  assert.equal(lastReq.model, "claude-opus-5-5");
  const draftResults = requests[4].messages.at(-1).content;
  assert.equal(draftResults.filter((r) => r.is_error).length, 2);

  const approve = await api(`/api/runs/${run.id}/approve`, { method: "POST" });
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  assert.equal(approve.body.payout_batch_id, "PB123");

  const payout = paypalCalls.find((c) => c.url.endsWith("/v1/payments/payouts"));
  assert.equal(payout.body.sender_batch_header.sender_batch_id, `celerity-${run.id}`);
  assert.deepEqual(payout.body.items.map((i) => `${i.amount.value} ${i.amount.currency}`).sort(), ["70.00 USD", "90.00 USD"]);

  // Approving twice must not create a second batch.
  assert.equal((await api(`/api/runs/${run.id}/approve`, { method: "POST" })).status, 409);

  const item = approve.body.items.find((i) => i.family_id === "fam_001");
  const hook = (id, type, resource) => api("/api/webhooks/paypal", { method: "POST", key: null, body: { id, event_type: type, resource } });
  await hook("WH-1", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", {
    payout_batch_id: "PB123",
    payout_item_id: "ITEM1",
    transaction_id: "TX1",
    transaction_status: "SUCCESS",
    payout_item: { sender_item_id: item.sender_item_id },
  });
  await hook("WH-1", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", {}); // duplicate delivery
  await hook("WH-2", "PAYMENT.PAYOUTSBATCH.SUCCESS", { batch_header: { payout_batch_id: "PB123", batch_status: "SUCCESS" } });

  const { body } = await api("/api/state");
  const batch = body.batches[0];
  assert.equal(batch.status, "SUCCESS");
  const paid = batch.items.find((i) => i.family_id === "fam_001");
  assert.equal(paid.status, "SUCCESS");
  assert.equal(paid.transaction_id, "TX1");
  assert.deepEqual(paid.history.map((h) => h.status), ["APPROVED", "SUCCESS"]);
  assert.equal(body.chain.ok, true);
  assert.equal(body.events.filter((e) => e.type === "webhook.received").length, 2);

  // The same storm can't pay the same family twice.
  const pub = await api("/api/public", { key: null });
  assert.equal(pub.body.storms[0].families, 2);
  assert.equal(JSON.stringify(pub.body).includes("@"), false, "public view leaks no emails");
});

test("a second run for the same storm cannot re-draft paid families", async () => {
  const { state } = store;
  const run = { storm: "DALISAY", areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }], drafts: [] };
  const { eligibility } = await import("../src/policy.js");
  const el = eligibility(state, state.families.find((f) => f.id === "fam_001"), run);
  assert.equal(el.eligible, false);
});
