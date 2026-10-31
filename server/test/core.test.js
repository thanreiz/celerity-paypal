// The Java core client: who answers in each CORE_MODE, what is sent, and
// what happens when the core is down. A fake core stands in for Java.

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

process.env.PAYOUT_CURRENCY = "USD";
process.env.SEED_RECEIVER_EMAILS = "";

const { emptyState } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const core = await import("../src/core.js");

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
