import { requireGate, rateLimit } from "./_lib/gate.js";
import { decodeValue, jsonSafe } from "./_lib/serialize.js";
import { invokeOnChain } from "./_lib/stellar.js";

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    rateLimit(req);
    requireGate(req);
    const body = await readBody(req);
    const role = body.role;
    const method = body.method;
    const args = decodeValue(body.args || {});
    if (!role || !method) {
      res.status(400).json({ error: "role and method required" });
      return;
    }
    const result = await invokeOnChain(role, method, args);
    res.status(200).json({ result: jsonSafe(result) });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || String(e) });
  }
}
