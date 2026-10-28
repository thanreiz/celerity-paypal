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

export const config = {
  port: num("PORT", 8787),
  dataDir: env.DATA_DIR || new URL("../data/", import.meta.url).pathname,

  paypal: {
    env: env.PAYPAL_ENV === "live" ? "live" : "sandbox",
    clientId: env.PAYPAL_CLIENT_ID || "",
    clientSecret: env.PAYPAL_CLIENT_SECRET || "",
    webhookId: env.PAYPAL_WEBHOOK_ID || "",
  },

  anthropic: {
    model: env.CLAUDE_MODEL || "claude-opus-5-5",
    effort: env.CLAUDE_EFFORT || "medium",
    configured: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
  },

  // Coordinator passcode for actions that spend money or Claude credits.
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
    aiConfigured: config.anthropic.configured,
    model: config.anthropic.model,
    coordinatorKeyRequired: Boolean(config.coordinatorKey),
    policy,
  };
}
