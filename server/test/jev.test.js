// Jev (TypeSafe System One) behind its adapter: what Celerity does with its
// answers, and that every failure falls back to the parser, the GPT agent
// and a coordinator. A fake TypeSafe API stands in for the real one.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "";
process.env.AI_PROVIDER = "anthropic";
process.env.PAYOUT_CURRENCY = "USD";
delete process.env.CORE_MODE;
delete process.env.AUTO_RELEASE;
const KEY_VALUE = "ts-secret-key-do-not-log";
process.env.TYPESAFE_API_KEY = KEY_VALUE;
delete process.env.TYPESAFE_MODEL;
process.env.TYPESAFE_TIMEOUT_MS = "300";

const { createMemoryStore } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");
const { routeBulletin } = await import("../src/rules.js");
const { systemOne, triageFarmerMessage } = await import("../src/jev.js");

// --- fake TypeSafe + PayPal ---------------------------------------------------
let jevAnswer = null; // (requestBody) => answers object, or a Response
let jevCalls = [];
let payoutPosts = [];
const realFetch = globalThis.fetch;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u === "https://api.typesafe.ai/v1/systemone") {
    const body = JSON.parse(init.body);
    jevCalls.push({ body, auth: init.headers.Authorization });
    const out = jevAnswer ? jevAnswer(body) : null;
    if (out instanceof Response) return out;
    if (!out) return json(500, { detail: { error_type: "server_error", message: "boom" } });
    return json(200, { model: "jev-1.14.0", answers: out, usage: { input_tokens: 1, output_tokens: 1 } });
  }
  if (u.startsWith("https://api-m.sandbox.paypal.com")) {
    if (u.endsWith("/v1/oauth2/token")) return json(200, { access_token: "tok", expires_in: 3600 });
    if (u.endsWith("/v1/payments/payouts") && init.method === "POST") {
      payoutPosts.push(JSON.parse(init.body));
      return json(201, { batch_header: { payout_batch_id: `PB${payoutPosts.length}`, batch_status: "PENDING" } });
    }
  }
  return realFetch(url, init);
};

/** Answers for every question in a request: injection noul, and per phrase
 * a province choice and a whole-province noul. */
const answersFor = ({ injection = 0.02, place = () => ({ province: "none of these", p: 1, whole: 0.1 }) } = {}) => (body) => {
  const a = {};
  for (const [id, q] of Object.entries(body.questions)) {
    if (id === "injection") a[id] = { type: "noul", noul: injection };
    else if (id.startsWith("province_")) {
      const { province, p } = place(Number(id.split("_")[1]));
      const probabilities = Object.fromEntries(Object.keys(q.criteria).map((k) => [k, k === province ? p : (1 - p) / (Object.keys(q.criteria).length - 1)]));
      a[id] = { type: "choice", choice: province, confidence: p, probabilities };
    } else if (id.startsWith("whole_")) a[id] = { type: "noul", noul: place(Number(id.split("_")[1])).whole };
    else if (id === "topic") a[id] = { type: "choice", choice: "damage_report", confidence: 0.9, probabilities: { damage_report: 0.95, other: 0.05 } };
    else if (id === "needs_human") a[id] = { type: "noul", noul: 0.93 };
  }
  return a;
};

// --- scripted Claude ----------------------------------------------------------
let n = 0;
let script = [];
let requests = [];
const toolUse = (name, input) => ({ type: "tool_use", id: `tu_${++n}`, name, input });
const turn = (content, stop_reason = "tool_use") => ({ content, stop_reason, usage: { input_tokens: 10, output_tokens: 5 } });
const fakeClaude = {
  beta: {
    messages: {
      create: async (params) => {
        requests.push(structuredClone(params));
        const next = script.shift();
        if (!next) throw new Error("script exhausted");
        return next;
      },
    },
  },
};

let server, base, store;
const KEY = "letmein";
const api = (path, { method = "GET", body, key = KEY } = {}) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "x-coordinator-key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  store = createMemoryStore({ seed: seedState });
  const app = createApp({ store, aiClient: fakeClaude, coordinatorKey: KEY });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => {
  jevAnswer = null;
  jevCalls = [];
  script = [];
  requests = [];
  process.env.TYPESAFE_API_KEY = KEY_VALUE;
});

const OMPONG = `TROPICAL CYCLONE BULLETIN NR. 05
Typhoon OMPONG
TCWS No. 3 (Storm-force winds)
Luzon: Catanduanes, the Province of Albay

TCWS No. 2 (Gale-force winds)
Luzon: Sorsogon, the Caramoan Peninsula

Note: the Caramoan Peninsula is in Camarines Sur.`;

test("the request follows the TypeSafe API: bearer key, jev-latest, typed questions", async () => {
  jevAnswer = answersFor();
  await routeBulletin(OMPONG);
  assert.equal(jevCalls.length, 1);
  const { body, auth } = jevCalls[0];
  assert.equal(auth, `Bearer ${KEY_VALUE}`);
  assert.equal(body.model, "jev-latest");
  assert.equal(body.questions.injection.type, "noul");
  assert.equal(body.questions.province_0.type, "choice");
  // Jev may only choose among provinces the bulletin names, or none.
  assert.deepEqual(Object.keys(body.questions.province_0.criteria).sort(), ["Albay", "Camarines Sur", "Catanduanes", "Sorsogon", "none of these"].sort());
});

test("confident whole-province placements put the bulletin on the rules path, at the phrase's own signal", async () => {
  jevAnswer = answersFor({
    place: (i) => (i === 0 ? { province: "Albay", p: 0.99, whole: 0.97 } : { province: "Camarines Sur", p: 0.98, whole: 0.97 }),
  });
  const r = await routeBulletin(OMPONG);
  assert.equal(r.route, "jev");
  assert.equal(r.hold, null);
  assert.deepEqual(
    r.parsed.areas.filter((a) => ["Albay", "Camarines Sur"].includes(a.province)),
    [
      { province: "Albay", municipality: null, signal_level: 3 },
      { province: "Camarines Sur", municipality: null, signal_level: 2 },
    ]
  );
});

test("part of a province, low probability, or no answer all go to the GPT agent", async () => {
  const cases = [
    (i) => (i === 0 ? { province: "Albay", p: 0.99, whole: 0.97 } : { province: "Camarines Sur", p: 0.99, whole: 0.2 }), // a peninsula
    (i) => ({ province: i === 0 ? "Albay" : "Camarines Sur", p: 0.9, whole: 0.99 }), // under 0.95
    () => ({ province: "none of these", p: 1, whole: 0.99 }),
  ];
  for (const place of cases) {
    jevAnswer = answersFor({ place });
    assert.equal((await routeBulletin(OMPONG)).route, "agent");
  }
  jevAnswer = null; // TypeSafe answers 500
  const down = await routeBulletin(OMPONG);
  assert.equal(down.route, "agent");
  assert.equal(down.jev, null);
});

test("without a key Jev is never called and everything works as before", async () => {
  delete process.env.TYPESAFE_API_KEY;
  const r = await routeBulletin(OMPONG);
  assert.equal(r.route, "agent");
  assert.equal(r.jev, null);
  assert.equal((await routeBulletin((await store.read()).bulletins.find((b) => b.id === "blt_dalisay_08").text)).route, "rules");
  assert.equal(jevCalls.length, 0);
  assert.equal(await triageFarmerMessage({ messages: [{ role: "farmer", text: "hi" }] }), null);
});

test("an answer that doesn't match the questions, or a timeout, falls back without leaking the key", async () => {
  const warnings = [];
  const warn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    jevAnswer = () => ({ injection: { type: "choice" } });
    assert.equal(await systemOne("s", { injection: { type: "noul", instructions: "x" } }), null);
    jevAnswer = () => json(401, { detail: { error_type: "authentication_error", message: `bad key ${KEY_VALUE}` } });
    assert.equal(await systemOne("s", { injection: { type: "noul", instructions: "x" } }), null);
    const slow = await systemOne("s", { q: { type: "noul", instructions: "x" } }, { fetchImpl: (u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason))) });
    assert.equal(slow, null);
  } finally {
    console.warn = warn;
  }
  assert.ok(warnings.length >= 3);
  assert.ok(warnings.every((w) => !w.includes(KEY_VALUE)), "the key never reaches the logs");
});

test("a probability outside 0 to 1, or a missing one, is not an answer", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const noul = { injection: { type: "noul", instructions: "x" } };
    for (const bad of [91, -0.2, "0.9", null, undefined, Number.NaN]) {
      jevAnswer = () => ({ injection: { type: "noul", noul: bad } });
      assert.equal(await systemOne("s", noul), null, `noul ${bad}`);
    }
    const choice = { place: { type: "choice", instructions: "x", criteria: { Albay: "a", Sorsogon: "b" } } };
    jevAnswer = () => ({ place: { type: "choice", choice: "Albay", probabilities: { Albay: 96 } } });
    assert.equal(await systemOne("s", choice), null, "a percentage is not a probability");
    jevAnswer = () => ({ place: { type: "choice", choice: "Cebu", probabilities: { Cebu: 0.99 } } });
    assert.equal(await systemOne("s", choice), null, "a choice that was never offered");
    jevAnswer = () => ({ place: { type: "choice", choice: "Albay", probabilities: { Albay: 0.99 } } });
    assert.notEqual(await systemOne("s", choice), null);
  } finally {
    console.warn = warn;
  }
});

test("when Jev is on but gives no answer, even a routine bulletin waits for a coordinator", async () => {
  const dalisay = (await store.read()).bulletins.find((b) => b.id === "blt_dalisay_08").text;
  jevAnswer = null; // TypeSafe answers 500
  const down = await routeBulletin(dalisay);
  assert.equal(down.route, "rules");
  assert.match(down.hold, /could not check/);
  jevAnswer = answersFor();
  assert.equal((await routeBulletin(dalisay)).hold, null);
});

test("only province names written out in full count as named, and a 21st leftover phrase is never skipped", async () => {
  // "Eastern Samar" must not make "Samar" an option Jev can pick.
  jevAnswer = answersFor();
  jevCalls.length = 0;
  await routeBulletin("Typhoon ANA\nTCWS No. 3\nVisayas: Eastern Samar, Southern Leyte, the far coast");
  const offered = Object.keys(jevCalls[0].body.questions.province_0.criteria);
  assert.ok(offered.includes("Eastern Samar") && offered.includes("Southern Leyte"));
  assert.ok(!offered.includes("Samar") && !offered.includes("Leyte"));

  // Jev is asked about 20 phrases at most; with 21 the bulletin goes to the agent.
  const phrases = Array.from({ length: 21 }, (_, i) => `the Province of Albay ${i}`).join(", ");
  jevAnswer = answersFor({ place: () => ({ province: "Albay", p: 0.99, whole: 0.99 }) });
  assert.equal((await routeBulletin(`Typhoon ANA\nTCWS No. 3\nLuzon: Albay, ${phrases}`)).route, "agent");
});

test("a bulletin Jev flags as carrying instructions is drafted by the rules but held for a coordinator", async () => {
  payoutPosts = [];
  jevAnswer = answersFor({ injection: 0.96 });
  const res = await api("/api/bulletins/blt_tampered/runs", { method: "POST" });
  assert.equal(res.status, 201);
  const run = await res.json();
  assert.equal(run.mode, "rules");
  assert.equal(run.auto_release, false);
  assert.match(run.jev.hold, /96%/);
  assert.equal(run.status, "awaiting_approval");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(payoutPosts.length, 0, "nothing sent without a person");
  assert.equal((await store.read()).runs.find((r) => r.id === run.id).status, "awaiting_approval");
  await api(`/api/runs/${run.id}/reject`, { method: "POST", body: { reason: "test" } });
});

test("a Jev-routed bulletin is drafted by the rules, marked as Jev's, and waits for a coordinator", async () => {
  payoutPosts = [];
  const added = await (await api("/api/bulletins", { method: "POST", body: { title: "Ompong #5", text: OMPONG } })).json();
  jevAnswer = answersFor({
    place: (i) => (i === 0 ? { province: "Albay", p: 0.99, whole: 0.97 } : { province: "Camarines Sur", p: 0.98, whole: 0.96 }),
  });
  const run = await (await api(`/api/bulletins/${added.id}/runs`, { method: "POST" })).json();
  assert.equal(run.mode, "jev");
  assert.equal(run.auto_release, false, "an AI placed part of it, so a person approves");
  assert.equal(run.status, "awaiting_approval");
  assert.ok(run.steps.some((s) => /Jev placed "the Province of Albay" as all of Albay/.test(s.text || "")));
  const albay = run.drafts.filter((d) => d.family_id >= "fam_005" && d.family_id <= "fam_008");
  assert.ok(albay.length > 0 && albay.every((d) => d.signal === 3));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(payoutPosts.length, 0, "nothing sent on Jev's judgment alone");
  assert.equal((await store.read()).runs.find((r) => r.id === run.id).status, "awaiting_approval");
  assert.equal((await api(`/api/runs/${run.id}/approve`, { method: "POST" })).status, 200);
  const saved = (await store.read()).runs.find((r) => r.id === run.id);
  assert.equal(saved.status, "approved");
  assert.notEqual(saved.approved_by, "jev");
  assert.equal(payoutPosts.length, 1);
  const pub = await (await api("/api/public", { key: null })).json();
  assert.equal(pub.events.find((e) => e.type === "run.drafted").actor, "jev");
});

test("Jev opens a case when a person must follow up, even if GPT doesn't", async () => {
  const fam = (await store.read()).families.find((f) => f.id === "fam_009");
  jevAnswer = answersFor();
  script = [turn([{ type: "text", text: "Pasensya po. Ingat kayo." }], "end_turn")];
  const out = await (
    await api(`/api/me/${fam.link_token}/help`, { method: "POST", key: null, body: { messages: [{ role: "farmer", text: "Nasira ang bubong at palay namin" }] } })
  ).json();
  assert.deepEqual(out.case, { topic: "damage_report" });
  assert.equal(out.triage.topic, "damage_report");
  assert.match(requests[0].messages[0].content, /classifier read the last message as "damage_report"/);
  const c = (await store.read()).cases.find((x) => x.family_id === "fam_009");
  assert.match(c.summary, /^Flagged by Jev \(93%\)/);
});
