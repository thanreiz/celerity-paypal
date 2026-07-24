import { requireGate, rateLimit } from "./_lib/gate.js";
import { encodeValue } from "./_lib/serialize.js";
import { signOracleEvent } from "./_lib/stellar.js";

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 100_000) reject(new Error("Body too large"));
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
    const region = Number(body.region);
    const signal = Number(body.signal);
    const nonce = body.nonce != null ? BigInt(body.nonce) : BigInt(Date.now());
    if (!Number.isFinite(region) || !Number.isFinite(signal)) {
      res.status(400).json({ error: "region and signal required" });
      return;
    }
    const signed = signOracleEvent(region, signal, nonce);
    res.status(200).json({
      region: signed.region,
      signal: signed.signal,
      nonce: signed.nonce,
      signature: encodeValue(signed.signature),
      oracle_public_key: signed.oracle_public_key,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
