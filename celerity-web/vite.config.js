import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { apiDevPlugin } from "./api/_lib/vitePlugin.js";

// `global` shim: @stellar/stellar-sdk's browser build reaches for a few
// Node-isms that Vite doesn't provide by default.
export default defineConfig(({ mode }) => {
  // Load ALL env keys into process.env for the /api dev middleware (secrets
  // must never use the VITE_ prefix or they end up in the browser bundle).
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  return {
    plugins: [react(), apiDevPlugin()],
    define: {
      global: "globalThis",
    },
  };
});
