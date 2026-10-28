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

// Responses API: reasoning models only accept function tools here, not on
// Chat Completions. Turns chain through previous_response_id, so OpenAI keeps
// the reasoning items between tool calls and we only send the new input.
function openaiSession({ client, system, tools, userText }) {
  const openai = client || new OpenAI();
  const toolDefs = tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: true,
  }));
  let input = [{ role: "user", content: userText }];
  let previousId = null;

  return {
    async next() {
      const res = await openai.responses.create({
        model: config.ai.model,
        instructions: system,
        input,
        tools: toolDefs,
        reasoning: { effort: config.ai.effort },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        ...(previousId ? { previous_response_id: previousId } : {}),
      });
      previousId = res.id;
      input = [];

      const output = res.output || [];
      const parts = output.filter((o) => o.type === "message").flatMap((o) => o.content || []);
      const refusal = parts.find((p) => p.type === "refusal");
      if (refusal || res.incomplete_details?.reason === "content_filter") {
        throw new Error(`OpenAI declined this request${refusal ? `: ${refusal.refusal}` : ""}`);
      }

      const toolCalls = output
        .filter((o) => o.type === "function_call")
        .map((c) => {
          try {
            return { id: c.call_id, name: c.name, input: JSON.parse(c.arguments) };
          } catch (e) {
            return { id: c.call_id, name: c.name, input: null, parseError: e.message };
          }
        });
      return {
        text: parts
          .filter((p) => p.type === "output_text")
          .map((p) => p.text)
          .join("\n")
          .trim(),
        toolCalls,
        stop: res.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : toolCalls.length ? "tool" : "end",
        usage: { input: res.usage?.input_tokens || 0, output: res.usage?.output_tokens || 0 },
      };
    },
    addToolResults(results) {
      // No is_error flag on function outputs; the error is in the JSON body.
      input = results.map((r) => ({ type: "function_call_output", call_id: r.id, output: r.content }));
    },
  };
}

export function createSession({ provider, ...opts }) {
  if (provider === "openai") return openaiSession(opts);
  if (provider === "anthropic") return anthropicSession(opts);
  throw new Error(`unknown AI provider "${provider}" (use "anthropic" or "openai")`);
}
