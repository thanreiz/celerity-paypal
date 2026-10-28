// The same agent loop driven through the OpenAI adapter with a scripted
// chat.completions client.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PROVIDER = "openai";
process.env.OPENAI_MODEL = "gpt-test";

const { runAgent } = await import("../src/agent.js");
const { emptyState } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");

let n = 0;
const call = (name, args) => ({
  id: `call_${++n}`,
  type: "function",
  function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
});
const reply = (message, finish_reason = "tool_calls") => ({
  choices: [{ message: { role: "assistant", content: null, refusal: null, ...message }, finish_reason }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
});

const script = [
  reply({
    tool_calls: [
      call("record_bulletin_facts", {
        storm_name: "Typhoon Dalisay",
        bulletin_number: "8",
        areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }],
      }),
    ],
  }),
  reply({
    content: "Drafting now.",
    tool_calls: [
      call("draft_payout", { family_id: "fam_002", amount: 70, rationale: "Signal 4, household of 4" }),
      call("draft_payout", { family_id: "fam_001", amount: 999, rationale: "too much" }),
      call("draft_payout", "{not json"),
    ],
  }),
  reply({ content: "Drafted 1 family in Catanduanes." }, "stop"),
];

test("OpenAI adapter runs the agent loop and returns tool results", async () => {
  const requests = [];
  const client = {
    chat: {
      completions: {
        create: async (params) => {
          requests.push(structuredClone(params));
          return script[requests.length - 1];
        },
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
  assert.equal(first.messages[0].role, "system");
  assert.equal(first.tools[0].type, "function");
  assert.equal(first.tools[0].function.strict, true);
  assert.equal(first.tools[0].function.parameters.additionalProperties, false);

  // Every tool call gets a tool message, including refused and malformed ones.
  const toolMsgs = requests[2].messages.filter((m) => m.role === "tool");
  assert.equal(toolMsgs.length, 4);
  assert.match(toolMsgs[2].content, /exceeds this family's policy cap/);
  assert.match(toolMsgs[3].content, /not valid JSON/);
  const assistantTurn = requests[2].messages.find((m) => m.role === "assistant" && m.tool_calls?.length === 3);
  assert.ok(assistantTurn, "assistant tool_calls are replayed before their results");

  const failed = run.steps.filter((s) => s.kind === "tool" && !s.ok);
  assert.equal(failed.length, 2);
  assert.ok(run.steps.some((s) => s.kind === "note" && s.text === "Drafting now."));
});

test("OpenAI refusal fails the run", async () => {
  const client = {
    chat: { completions: { create: async () => reply({ refusal: "I can't help with that." }, "stop") } },
  };
  const state = emptyState();
  seedState(state);
  const run = { drafts: [], steps: [], usage: { input_tokens: 0, output_tokens: 0 } };
  await assert.rejects(
    runAgent({ state, run, bulletin: { text: "x", source: "t", received_at: "now" }, client, provider: "openai" }),
    /OpenAI declined/
  );
});
