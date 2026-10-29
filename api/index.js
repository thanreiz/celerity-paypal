// Vercel serverless entry: the whole Express API as one function. Vercel
// rewrites /api/* here (vercel.json) and serves the built frontend itself.

import { createApp } from "../server/src/app.js";
import { storeFromEnv } from "../server/src/storage.js";

// A deployed console without a key would be open to anyone: refuse to start.
if (!process.env.COORDINATOR_KEY) {
  throw new Error("COORDINATOR_KEY is not set: add it to this Vercel project's environment variables, then redeploy.");
}

export default createApp({ store: storeFromEnv() });
