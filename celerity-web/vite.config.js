import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `global` shim: @stellar/stellar-sdk's browser build reaches for a few
// Node-isms that Vite doesn't provide by default.
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
});
