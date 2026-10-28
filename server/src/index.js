import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { createStore } from "./store.js";
import { seedState } from "./seed.js";
import { createApp } from "./app.js";

const store = createStore({ dir: config.dataDir, seed: seedState });

// A run that was mid-flight when the process died will never finish.
for (const run of store.state.runs) {
  if (run.status === "running") {
    run.status = "failed";
    run.error = "server restarted during the run";
    run.finished_at = new Date().toISOString();
  }
}
await store.persist();

const staticDir = fileURLToPath(new URL("../../celerity-web/dist", import.meta.url));
const app = createApp({ store, staticDir });

app.listen(config.port, () => {
  console.log(`Celerity Relief API on http://localhost:${config.port} (PayPal ${config.paypal.env})`);
  if (!config.paypal.clientId) console.warn("  ! PAYPAL_CLIENT_ID not set: approvals will fail");
  if (!config.anthropic.configured) console.warn("  ! ANTHROPIC_API_KEY not set: agent runs are disabled");
  if (!config.paypal.webhookId) console.warn("  ! PAYPAL_WEBHOOK_ID not set: webhooks rejected, use Refresh to poll PayPal");
  if (!config.coordinatorKey) console.warn("  ! COORDINATOR_KEY not set: the console is open to anyone (dev only)");
});
