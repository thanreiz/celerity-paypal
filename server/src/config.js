import { fileURLToPath } from "node:url";

// All runtime configuration comes from the environment. Secrets never reach
// the browser: the frontend only sees the public subset from publicConfig().

const env = process.env;

function num(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

// AI_PROVIDER picks the agent's model vendor. Unset, it follows whichever
// key is present, preferring Anthropic.
function aiConfig() {
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const hasOpenAI = Boolean(env.OPENAI_API_KEY);
  const provider = env.AI_PROVIDER || (hasAnthropic || !hasOpenAI ? "anthropic" : "openai");
  return {
    provider,
    model: provider === "openai" ? env.OPENAI_MODEL || "gpt-5.5" : env.CLAUDE_MODEL || "claude-opus-5-5",
    effort: env.AI_EFFORT || "medium",
    configured: provider === "openai" ? hasOpenAI : hasAnthropic,
  };
}

export const config = {
  port: num("PORT", 8787),
  dataDir: env.DATA_DIR || fileURLToPath(new URL("../data/", import.meta.url)),

  paypal: {
    env: env.PAYPAL_ENV === "live" ? "live" : "sandbox",
    clientId: env.PAYPAL_CLIENT_ID || "",
    clientSecret: env.PAYPAL_CLIENT_SECRET || "",
    webhookId: env.PAYPAL_WEBHOOK_ID || "",
  },

  ai: aiConfig(),

  // Coordinator passcode for actions that spend money or AI credits.
  // Empty = open (local dev only; the server warns on boot).
  coordinatorKey: env.COORDINATOR_KEY || "",

  // Max agent runs per hour across the whole deployment (protects a public demo).
  agentRunsPerHour: num("AGENT_RUNS_PER_HOUR", 20),

  // Comma-separated PayPal sandbox personal-account emails. Seeded families
  // are assigned these round-robin so demo payouts land in real sandbox
  // wallets instead of going UNCLAIMED.
  seedReceiverEmails: (env.SEED_RECEIVER_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function paypalBaseUrl() {
  return config.paypal.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function publicConfig(policy) {
  return {
    paypalEnv: config.paypal.env,
    paypalConfigured: Boolean(config.paypal.clientId && config.paypal.clientSecret),
    webhooksVerified: Boolean(config.paypal.webhookId),
    aiConfigured: config.ai.configured,
    aiProvider: config.ai.provider,
    model: config.ai.model,
    coordinatorKeyRequired: Boolean(config.coordinatorKey),
    policy,
  };
}
