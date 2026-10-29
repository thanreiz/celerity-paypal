// Vercel serverless entry: the whole Express API as one function. Vercel
// rewrites /api/* here (vercel.json) and serves the built frontend itself.

import { createApp } from "../server/src/app.js";
import { storeFromEnv } from "../server/src/storage.js";

export default createApp({ store: storeFromEnv() });
