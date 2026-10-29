import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api goes to the Express server (server/, port 8787). In
// production the same server serves this build, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.API_ORIGIN || "http://localhost:8787",
    },
  },
});
