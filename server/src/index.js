// Long-running server for local development (and any host with a disk).
// On Vercel, api/index.js wraps the same app as a serverless function.

import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { storeFromEnv } from "./storage.js";
import { createApp } from "./app.js";

const store = storeFromEnv();
const staticDir = fileURLToPath(new URL("../../celerity-web/dist", import.meta.url));
const app = createApp({ store, staticDir });

app.listen(config.port, () => {
  console.log(`Celerity Relief API on http://localhost:${config.port} (PayPal ${config.paypal.env}, ${store.kind} store)`);
  if (!config.paypal.clientId) console.warn("  ! PAYPAL_CLIENT_ID not set: approvals will fail");
  console.log(`  AI agent: ${config.ai.provider} / ${config.ai.model}`);
  if (!config.ai.configured) {
    console.warn(`  ! ${config.ai.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} not set: agent runs are disabled`);
  }
  if (!config.paypal.webhookId) console.warn("  ! PAYPAL_WEBHOOK_ID not set: webhooks rejected, use Refresh to poll PayPal");
  if (!config.coordinatorKey) console.warn("  ! COORDINATOR_KEY not set: the console is open to anyone (dev only)");
});
