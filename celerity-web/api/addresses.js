import { rateLimit } from "./_lib/gate.js";
import { addresses } from "./_lib/stellar.js";

/** Public demo addresses only — no gate required (keys are on-chain public). */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    rateLimit(req);
    res.status(200).json(addresses());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
