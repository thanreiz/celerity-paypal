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
