// Agent tool validation, run lifecycle, payout status ordering and the
// public aggregate, against an in-memory store.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.AI_PROVIDER = "anthropic";
process.env.RUN_DEADLINE_MS = "300";

const { createMemoryStore, emptyState, eventLogger } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");
const { executeTool } = await import("../src/agent.js");
const { applyWebhookEvent, applyBatchSnapshot } = await import("../src/payouts.js");

const seeded = () => {
  const s = emptyState();
  seedState(s);
  return s;
};

test("bulletin facts are validated and areas must appear in the bulletin text", () => {
  const state = seeded();
  const run = { drafts: [] };
  const text = "TCWS No. 3 is raised over Albay.";
  const facts = (areas, storm_name = "Typhoon Ana") => executeTool(state, run, "record_bulletin_facts", { storm_name, bulletin_number: "3", areas }, text);

  assert.match(facts([{ province: "Albay", municipality: null, signal_level: 3 }], "").content.error, /storm_name/);
  assert.match(facts([null]).content.error, /province/);
  assert.match(facts([{ province: "Albay", municipality: null, signal_level: 7 }]).content.error, /1 to 5/);
  assert.match(facts([{ province: "Catanduanes", municipality: null, signal_level: 5 }]).content.error, /does not appear/);
  assert.equal(run.areas, undefined, "nothing recorded from rejected calls");

  const ok = facts([{ province: " albay ", municipality: "", signal_level: 3 }]);
  assert.equal(ok.isError, undefined);
  assert.deepEqual(run.areas, [{ province: "albay", municipality: null, signal_level: 3 }]);

  const long = executeTool(state, run, "draft_payout", { family_id: "fam_005", amount: 1, rationale: "r".repeat(1000) });
  assert.equal(long.content.rationale.length, 300);
});

test("a stale PENDING poll does not undo a delivered payout; clawbacks still apply", () => {
  const state = emptyState();
  const log = eventLogger(state);
  const batch = {
    id: "bat_1",
    payout_batch_id: "PB1",
    status: "PENDING",
    items: [{ family_id: "fam_001", sender_item_id: "s1", status: "PENDING", history: [] }],
  };
  state.batches.push(batch);
  applyWebhookEvent(state, log, {
    id: "WH-1",
    event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
    resource: { payout_batch_id: "PB1", transaction_status: "SUCCESS", payout_item: { sender_item_id: "s1" } },
  });
  applyWebhookEvent(state, log, { id: "WH-2", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS", resource: { batch_header: { payout_batch_id: "PB1", batch_status: "SUCCESS" } } });

  const stale = { batch_header: { batch_status: "PROCESSING" }, items: [{ transaction_status: "PENDING", payout_item: { sender_item_id: "s1" } }] };
  assert.equal(applyBatchSnapshot(log, batch, stale), false);
  assert.equal(batch.status, "SUCCESS");
  assert.equal(batch.items[0].status, "SUCCESS");

  const returned = { batch_header: { batch_status: "SUCCESS" }, items: [{ transaction_status: "RETURNED", payout_item: { sender_item_id: "s1" } }] };
  applyBatchSnapshot(log, batch, returned);
  assert.equal(batch.items[0].status, "RETURNED");
});

// --- app-level ---------------------------------------------------------------
let hang;
const client = {
  beta: {
    messages: {
      create: async () => {
        await new Promise((r) => (hang = r));
        return { content: [{ type: "text", text: "late summary" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  },
};
const KEY = "k";
const store = createMemoryStore({ seed: seedState });
let server, base;
const api = (path, { method = "GET", body } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-coordinator-key": KEY },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

before(async () => {
  const app = createApp({ store, aiClient: client, coordinatorKey: KEY });
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const runStatus = async (id) => (await store.read()).runs.find((r) => r.id === id);

test("a run past its deadline fails, and the late agent can't bring it back", async () => {
  const start = await api("/api/bulletins/blt_dalisay_08/runs", { method: "POST", body: { mode: "agent" } });
  assert.equal(start.status, 202);
  await new Promise((r) => setTimeout(r, 450));
  const failed = await runStatus(start.body.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /did not finish within/);

  hang(); // the abandoned model call finally answers
  await new Promise((r) => setTimeout(r, 50));
  const after = await runStatus(start.body.id);
  assert.equal(after.status, "failed");
  assert.equal(after.summary, null);
});

test("one draft can be removed from a run awaiting approval", async () => {
  const runId = await store.mutate((state) => {
    state.runs.push({
      id: "run_drop",
      status: "awaiting_approval",
      storm: "Typhoon Drop",
      areas: [],
      drafts: [
        { family_id: "fam_001", amount: 10 },
        { family_id: "fam_002", amount: 20 },
      ],
      steps: [],
      started_at: new Date().toISOString(),
    });
    return "run_drop";
  });
  const res = await api(`/api/runs/${runId}/drafts/fam_001`, { method: "DELETE" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.totals, { recipients: 1, amount: 20 });
  assert.equal((await api(`/api/runs/${runId}/drafts/fam_001`, { method: "DELETE" })).status, 404);
  const last = await api(`/api/runs/${runId}/drafts/fam_002`, { method: "DELETE" });
  assert.equal(last.body.status, "no_action");
});

test("a storm named __proto__ doesn't pollute Object.prototype through /api/public", async () => {
  await store.mutate((state) => {
    state.batches.push({ id: "bat_p", storm: "__proto__", status: "PENDING", created_at: new Date().toISOString(), items: [{ family_id: "fam_009", amount: 5, status: "PENDING" }] });
  });
  const pub = await fetch(`${base}/api/public`).then((r) => r.json());
  assert.ok(pub.storms.some((s) => s.storm === "__proto__" && s.families === 1));
  assert.equal({}.families, undefined);
});
