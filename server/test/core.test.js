// The Java core client: who answers in each CORE_MODE, what is sent, and
// what happens when the core is down. A fake core stands in for Java.

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

process.env.PAYOUT_CURRENCY = "USD";
process.env.SEED_RECEIVER_EMAILS = "";

const { createMemoryStore, emptyState } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const core = await import("../src/core.js");
const { approveRun } = await import("../src/payouts.js");

let reply = () => ({ errors: [] });
const received = [];
let server, url;
before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      received.push({ path: req.url, token: req.headers["x-core-token"], body: JSON.parse(body) });
      const out = await reply(req.url);
      if (out === "down") return res.destroy();
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
afterEach(() => {
  received.length = 0;
  delete process.env.CORE_MODE;
  delete process.env.CORE_URL;
});

const state = (() => {
  const s = emptyState();
  seedState(s);
  return s;
})();
const run = { storm: "Typhoon Dalisay", areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }], drafts: [] };
const draft = { family_id: "fam_002", amount: 70 };

const warnings = [];
const realWarn = console.warn;
before(() => (console.warn = (...a) => warnings.push(a.join(" "))));
after(() => (console.warn = realWarn));

test("off by default: the local rules answer and the core is never called", async () => {
  assert.deepEqual(await core.checkDraft(state, run, draft), []);
  process.env.CORE_MODE = "on"; // without CORE_URL the mode stays off
  assert.deepEqual(await core.checkDraft(state, run, draft), []);
  assert.equal(received.length, 0);
});

test("shadow: the local answer stands, the core is asked, and a difference is logged without personal data", async () => {
  Object.assign(process.env, { CORE_MODE: "shadow", CORE_URL: url, CORE_TOKEN: "tok" });
  warnings.length = 0;
  reply = () => ({ errors: ["something else"] });
  assert.deepEqual(await core.checkDraft(state, run, draft), []);
  assert.equal(received.length, 1);
  assert.equal(received[0].path, "/v1/policy/check-draft");
  assert.equal(received[0].token, "tok");
  assert.equal(received[0].body.currency, "USD");
  const sent = JSON.stringify(received[0].body);
  assert.equal(sent.includes("@"), false, "no email is sent to the core");
  assert.equal(sent.includes("Jose Reyes"), false, "no names are sent to the core");
  assert.match(warnings.join("\n"), /core shadow mismatch on policy\/check-draft \(input [0-9a-f]{12}\)/);

  warnings.length = 0;
  reply = () => ({ errors: [] });
  await core.checkDraft(state, run, draft);
  assert.equal(warnings.length, 0, "matching answers are quiet");
});

test("on: the core decides, and 70 vs 70.0 or a missing key vs null still count as the same answer", async () => {
  Object.assign(process.env, { CORE_MODE: "on", CORE_URL: url });
  reply = () => ({ errors: ["from the core"] });
  assert.deepEqual(await core.checkDraft(state, run, draft), ["from the core"]);

  const local = { allocations: { fam_002: [{ pool_id: "p", amount: 70 }] }, shortfalls: [{ family_id: "x", short: 1 }] };
  const remote = { shortfalls: [{ province: null, short: 1.0, family_id: "x" }], allocations: { fam_002: [{ amount: 70.0, pool_id: "p" }] } };
  assert.equal(core.sameAnswer(local, remote), true);
  assert.equal(core.sameAnswer(local, { ...remote, shortfalls: [] }), false);
});

test("on: if the core is down, the local rules answer and it is logged", async () => {
  Object.assign(process.env, { CORE_MODE: "on", CORE_URL: url });
  warnings.length = 0;
  reply = () => "down";
  const r = await core.allocateRun(state, { drafts: [draft] });
  assert.equal(r.shortfalls.length, 0);
  assert.ok(r.allocations.fam_002.length >= 1);
  assert.match(warnings.join("\n"), /core unreachable on funding\/allocate, using the local rules/);
});

test("on: an answer in the wrong shape counts as no answer, so the local rules decide", async () => {
  Object.assign(process.env, { CORE_MODE: "on", CORE_URL: url });
  const local = { drafts: [draft] };
  for (const bad of [{}, { errors: "no" }, { errors: [1] }]) {
    reply = () => bad;
    assert.deepEqual(await core.checkDraft(state, run, draft), []);
  }
  for (const bad of [
    {},
    { allocations: {}, shortfalls: [] },
    { allocations: { fam_002: [{ pool_id: "p", amount: 1 }] }, shortfalls: [] },
    { allocations: { fam_002: [{ amount: 70 }] }, shortfalls: [] },
  ]) {
    warnings.length = 0;
    reply = () => bad;
    const r = await core.allocateRun(state, local);
    assert.equal(r.shortfalls.length, 0);
    assert.ok(r.allocations.fam_002[0].pool_id.startsWith("pool_"));
    assert.match(warnings.join("\n"), /using the local rules/);
  }
});

test("shadow: a malformed answer is logged and changes nothing", async () => {
  Object.assign(process.env, { CORE_MODE: "shadow", CORE_URL: url });
  warnings.length = 0;
  reply = () => ({});
  assert.deepEqual(await core.checkDraft(state, run, draft), []);
  assert.match(warnings.join("\n"), /core shadow call failed on policy\/check-draft: malformed/);
});

// A run waiting for approval, and a core that does `during` while it answers.
function approval(during, checkAnswer = { errors: [] }) {
  const store = createMemoryStore({
    seed: (s) => {
      seedState(s);
      s.runs.push({ id: "run_core", status: "awaiting_approval", storm: run.storm, areas: run.areas, drafts: [draft] });
    },
  });
  reply = async (path) => {
    await during(store);
    if (path === "/v1/policy/check-draft") return checkAnswer;
    return { allocations: { fam_002: [{ pool_id: "pool_a", amount: 70 }] }, shortfalls: [] };
  };
  return store;
}

test("on: no lock is held while the core answers", async () => {
  Object.assign(process.env, { CORE_MODE: "on", CORE_URL: url });
  let writes = 0;
  const store = approval(async (s) => {
    const wrote = s.mutate((x) => void (x.lockProbe = 1)).then(() => (writes += 1));
    await Promise.race([wrote, new Promise((r) => setTimeout(r, 500))]);
  }, { errors: ["from the core"] });
  // The probe writes state the rules don't read, so the core's answer stands.
  await assert.rejects(approveRun(store, "run_core", "ana"), (e) => {
    assert.equal(e.status, 409);
    assert.deepEqual(e.violations, [{ family_id: "fam_002", errors: ["from the core"] }]);
    return true;
  });
  assert.equal(writes, 2, "writers got through during both core calls");
  assert.equal((await store.read()).runs.at(-1).status, "awaiting_approval");
});

test("on: if the state changes while the core answers, the local rules decide on the new state", async () => {
  Object.assign(process.env, { CORE_MODE: "on", CORE_URL: url });
  warnings.length = 0;
  const store = approval((s) =>
    s.mutate((x) => {
      x.families.find((f) => f.id === "fam_002").status = "inactive";
    })
  );
  await assert.rejects(approveRun(store, "run_core", "ana"), (e) => {
    assert.equal(e.status, 409);
    assert.equal(e.violations[0].family_id, "fam_002");
    assert.ok(e.violations[0].errors.length >= 1);
    return true;
  });
  assert.match(warnings.join("\n"), /core answers went stale/);
});

test("off: approving never calls the core", async () => {
  const store = approval(async () => {}, { errors: ["from the core"] });
  await store.mutate((x) => {
    x.families.find((f) => f.id === "fam_002").status = "inactive";
  });
  await assert.rejects(approveRun(store, "run_core", "ana"), /no longer pass policy/);
  assert.equal(received.length, 0);
});
