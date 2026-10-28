// The same agent loop driven through the OpenAI adapter (Responses API) with
// a scripted client.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PROVIDER = "openai";
process.env.OPENAI_MODEL = "gpt-test";

const { runAgent } = await import("../src/agent.js");
const { emptyState } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");

let n = 0;
const call = (name, args) => ({
  type: "function_call",
  id: `fc_${++n}`,
  call_id: `call_${n}`,
  name,
  arguments: typeof args === "string" ? args : JSON.stringify(args),
});
const text = (t) => ({ type: "message", role: "assistant", content: [{ type: "output_text", text: t }] });
const reply = (output, extra = {}) => ({
  id: `resp_${++n}`,
  output: [{ type: "reasoning", id: `rs_${n}`, summary: [] }, ...output],
  usage: { input_tokens: 100, output_tokens: 20 },
  incomplete_details: null,
  ...extra,
});

const script = [
  reply([
    call("record_bulletin_facts", {
      storm_name: "Typhoon Dalisay",
      bulletin_number: "8",
      areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }],
    }),
  ]),
  reply([
    text("Drafting now."),
    call("draft_payout", { family_id: "fam_002", amount: 70, rationale: "Signal 4, household of 4" }),
    call("draft_payout", { family_id: "fam_001", amount: 999, rationale: "too much" }),
    call("draft_payout", "{not json"),
  ]),
  reply([text("Drafted 1 family in Catanduanes.")]),
];

test("OpenAI adapter runs the agent loop on the Responses API", async () => {
  const requests = [];
  const client = {
    responses: {
      create: async (params) => {
        requests.push(structuredClone(params));
        return script[requests.length - 1];
      },
    },
  };
  const state = emptyState();
  seedState(state);
  const run = { drafts: [], steps: [], areas: null, storm: null, usage: { input_tokens: 0, output_tokens: 0 } };
  const bulletin = { text: "TCWS No. 4: Catanduanes", source: "test", received_at: "now" };

  await runAgent({ state, run, bulletin, client, provider: "openai" });

  assert.equal(run.summary, "Drafted 1 family in Catanduanes.");
  assert.deepEqual(run.drafts.map((d) => [d.family_id, d.amount]), [["fam_002", 70]]);
  assert.equal(run.usage.input_tokens, 300);

  const first = requests[0];
  assert.equal(first.model, "gpt-test");
  assert.match(first.instructions, /disbursement agent/);
  assert.equal(first.previous_response_id, undefined);
  assert.equal(first.tools[0].type, "function");
  assert.equal(first.tools[0].strict, true);
  assert.equal(first.tools[0].parameters.additionalProperties, false);
  assert.ok(first.reasoning.effort);

  // Later turns chain on the previous response and send only tool outputs.
  const third = requests[2];
  assert.equal(third.previous_response_id, script[1].id);
  assert.equal(third.input.length, 3);
  assert.ok(third.input.every((i) => i.type === "function_call_output"));
  assert.deepEqual(
    third.input.map((i) => i.call_id),
    script[1].output.filter((o) => o.type === "function_call").map((o) => o.call_id)
  );
  assert.match(third.input[1].output, /exceeds this family's policy cap/);
  assert.match(third.input[2].output, /not valid JSON/);

  const failed = run.steps.filter((s) => s.kind === "tool" && !s.ok);
  assert.equal(failed.length, 2);
  assert.ok(run.steps.some((s) => s.kind === "note" && s.text === "Drafting now."));
});

test("OpenAI refusal fails the run", async () => {
  const client = {
    responses: {
      create: async () =>
        reply([{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "I can't help with that." }] }]),
    },
  };
  const state = emptyState();
  seedState(state);
  const run = { drafts: [], steps: [], usage: { input_tokens: 0, output_tokens: 0 } };
  await assert.rejects(
    runAgent({ state, run, bulletin: { text: "x", source: "t", received_at: "now" }, client, provider: "openai" }),
    /OpenAI declined/
  );
});
