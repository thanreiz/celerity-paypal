// LLM provider adapters. Each session keeps its own message history in the
// provider's native format and exposes the same two calls to agent.js:
//
//   next()               -> { text, toolCalls: [{ id, name, input }], stop, usage }
//   addToolResults(list) -> append [{ id, content, isError }] for the next turn
//
// stop is "tool" | "end" | "pause" | "max_tokens". Refusals throw.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "./config.js";

const MAX_OUTPUT_TOKENS = 16000;

function anthropicSession({ client, system, tools, userText }) {
  const anthropic = client || new Anthropic();
  const messages = [{ role: "user", content: userText }];
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, strict: true, input_schema: t.parameters }));
  const STOP = { end_turn: "end", tool_use: "tool", pause_turn: "pause", max_tokens: "max_tokens" };

  return {
    async next() {
      const res = await anthropic.beta.messages.create({
        model: config.ai.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: config.ai.effort },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        tools: toolDefs,
        messages,
      });
      if (res.stop_reason === "refusal") {
        throw new Error(`Claude declined this request (${res.stop_details?.category || "no category"})`);
      }
      // Pass the whole content back (thinking blocks included) to keep the turn valid.
      messages.push({ role: "assistant", content: res.content });
      return {
        text: res.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim(),
        toolCalls: res.content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input })),
        stop: STOP[res.stop_reason] || "end",
        usage: { input: res.usage?.input_tokens || 0, output: res.usage?.output_tokens || 0 },
      };
    },
    addToolResults(results) {
      messages.push({
        role: "user",
        content: results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      });
    },
  };
}

function openaiSession({ client, system, tools, userText }) {
  const openai = client || new OpenAI();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userText },
  ];
  const toolDefs = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters, strict: true },
  }));

  return {
    async next() {
      const res = await openai.chat.completions.create({
        model: config.ai.model,
        messages,
        tools: toolDefs,
        reasoning_effort: config.ai.effort,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
      });
      const choice = res.choices[0];
      const msg = choice.message;
      if (msg.refusal || choice.finish_reason === "content_filter") {
        throw new Error(`OpenAI declined this request${msg.refusal ? `: ${msg.refusal}` : ""}`);
      }
      const calls = (msg.tool_calls || []).filter((c) => c.type === "function");
      messages.push({ role: "assistant", content: msg.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });

      const toolCalls = calls.map((c) => {
        try {
          return { id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments) };
        } catch (e) {
          return { id: c.id, name: c.function.name, input: null, parseError: e.message };
        }
      });
      return {
        text: (msg.content || "").trim(),
        toolCalls,
        stop: choice.finish_reason === "length" ? "max_tokens" : toolCalls.length ? "tool" : "end",
        usage: { input: res.usage?.prompt_tokens || 0, output: res.usage?.completion_tokens || 0 },
      };
    },
    addToolResults(results) {
      for (const r of results) {
        // OpenAI has no is_error flag on tool messages; the error is in the JSON body.
        messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
      }
    },
  };
}

export function createSession({ provider, ...opts }) {
  if (provider === "openai") return openaiSession(opts);
  if (provider === "anthropic") return anthropicSession(opts);
  throw new Error(`unknown AI provider "${provider}" (use "anthropic" or "openai")`);
}
