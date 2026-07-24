import { timingSafeEqual } from "node:crypto";
import { demoGate } from "./env.js";

function equal(a, b) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

export function requireGate(req) {
  const expected = demoGate();
  if (!expected) {
    const err = new Error("DEMO_GATE is not configured on the server");
    err.status = 503;
    throw err;
  }
  const header = req.headers["x-celerity-gate"] || req.headers["authorization"] || "";
  const provided = String(header).replace(/^Bearer\s+/i, "").trim();
  if (!equal(provided, expected)) {
    const err = new Error("Invalid or missing demo gate PIN");
    err.status = 401;
    throw err;
  }
}

/** Soft per-IP rate limit (in-memory; resets on cold start). */
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;

export function rateLimit(req) {
  const ip =
    (req.headers["x-forwarded-for"] && String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
    req.socket?.remoteAddress ||
    "unknown";
  const now = Date.now();
  let bucket = hits.get(ip);
  if (!bucket || now - bucket.start > WINDOW_MS) {
    bucket = { start: now, count: 0 };
    hits.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_PER_WINDOW) {
    const err = new Error("Too many requests — slow down");
    err.status = 429;
    throw err;
  }
}
