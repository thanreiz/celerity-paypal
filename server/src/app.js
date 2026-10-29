// HTTP API. createApp() takes its dependencies so tests can run it with an
// in-memory store and a fake LLM client. Nothing is kept in process memory
// between requests, so the same app runs as a long-lived server or as a
// serverless function (Vercel).

import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { config, publicConfig } from "./config.js";
import { POLICY, VULNERABILITY_FLAGS, runTotals } from "./policy.js";
import { runAgent } from "./agent.js";
import { approveRun, rejectRun, refreshBatch, applyWebhookEvent, HttpError } from "./payouts.js";
import { waitUntil } from "@vercel/functions";
import { PayPalError, verifyWebhookSignature } from "./paypal.js";
import { newId, verifyChain } from "./store.js";

const SUCCESS_STATES = new Set(["SUCCESS"]);

// What the public transparency page may show of each evidence entry. Anything
// not listed (receiver emails, error payloads, free text typed by
// coordinators, family ids) stays coordinator-only.
const PUBLIC_DETAIL = {
  "family.registered": ["municipality", "province"],
  "family.status": ["status"],
  "bulletin.received": ["title"],
  "run.started": ["bulletin", "model"],
  "run.drafted": ["storm", "areas", "recipients", "amount", "currency"],
  "run.failed": [],
  "run.rejected": [],
  "run.draft_removed": ["recipients", "amount", "currency"],
  "run.approved": ["recipients", "amount", "currency"],
  "payout.submitting": ["recipients", "amount", "currency"],
  "payout.resumed": [],
  "payout.unconfirmed": [],
  "payout.error": ["name", "debugId"],
  "payout.batch_created": ["payout_batch_id", "batch_status"],
  "payout.batch_status": ["payout_batch_id", "batch_status"],
  "payout.item_status": ["status"],
  "webhook.received": ["event_type"],
};
const SYSTEM_ACTORS = new Set(["agent", "paypal", "paypal-webhook", "paypal-poll"]);
const FAMILY_EVENTS = new Set(["family.registered", "family.status"]);

function publicEvent({ detail, actor, ref, ...e }) {
  const keys = PUBLIC_DETAIL[e.type] || [];
  return {
    ...e,
    actor: SYSTEM_ACTORS.has(actor) ? actor : "coordinator",
    ref: FAMILY_EVENTS.has(e.type) ? null : ref,
    detail: Object.fromEntries(keys.filter((k) => detail?.[k] !== undefined).map((k) => [k, detail[k]])),
  };
}

/** A required, trimmed string of at most `max` characters, or a 400. */
function text(value, field, max) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${field} is required`);
  const v = value.trim();
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return v;
}

// A run still "running" after this long died with its function instance
// (Vercel caps a function at 300s).
const STALE_RUN_MS = 6 * 60_000;
// The agent itself gives up before Vercel's 300s limit can kill it silently.
const RUN_DEADLINE_MS = Number(process.env.RUN_DEADLINE_MS) || 240_000;

// Compare digests so the comparison takes the same time whatever the length.
const digest = (v) => createHash("sha256").update(String(v)).digest();
function sameSecret(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

// Wrong-key attempts per client, per warm instance. Serverless instances
// don't share memory, so this slows guessing rather than stopping it; the
// key itself is the real control.
const FAILED_AUTH_LIMIT = 10;
const FAILED_AUTH_WINDOW_MS = 10 * 60_000;
const failedAuth = new Map();
function tooManyFailures(ip, now = Date.now()) {
  const recent = (failedAuth.get(ip) || []).filter((t) => now - t < FAILED_AUTH_WINDOW_MS);
  failedAuth.set(ip, recent);
  return recent.length >= FAILED_AUTH_LIMIT;
}
function noteFailure(ip) {
  failedAuth.get(ip).push(Date.now());
  if (failedAuth.size > 10_000) failedAuth.delete(failedAuth.keys().next().value);
}

// The name a coordinator signs in with is shown in approvals and the trace.
const actorName = (raw) =>
  String(raw || "")
    .replace(/[^\p{L}\p{N} .,'-]/gu, "")
    .trim()
    .slice(0, 40) || "coordinator";

// PayPal webhook deliveries older than this are refused even with a valid
// signature, so an old event can't be replayed after it leaves the dedupe list.
const WEBHOOK_MAX_AGE_MS = 60 * 60_000;

// verifyChain re-hashes every entry; reuse the answer while the log is unchanged.
let chainCache = { key: null, result: null };
function verifiedChain(events) {
  const key = `${events.length}:${events.at(-1)?.hash || ""}`;
  if (chainCache.key !== key) chainCache = { key, result: verifyChain(events) };
  return chainCache.result;
}

export function createApp({ store, aiClient, staticDir, coordinatorKey = config.coordinatorKey } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "200kb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    // API answers are per-request and may be coordinator-only; /api/public
    // opts back in to short CDN caching below.
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  });

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  function coordinator(req, res, next) {
    if (coordinatorKey) {
      const ip = req.get("x-forwarded-for")?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
      if (tooManyFailures(ip)) return res.status(429).json({ error: "too many wrong keys; try again in a few minutes" });
      const given = req.get("x-coordinator-key") || "";
      if (!sameSecret(given, coordinatorKey)) {
        noteFailure(ip);
        return res.status(401).json({ error: given ? "that coordinator key is not valid" : "coordinator key required" });
      }
    }
    req.actor = actorName(req.get("x-coordinator-name"));
    next();
  }

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  app.get("/api/config", (req, res) => res.json(publicConfig(POLICY)));

  // Everything the coordinator console needs, in one poll.
  app.get("/api/state", coordinator, wrap(async (req, res) => {
    const state = await store.read();
    res.json({
      config: publicConfig(POLICY),
      families: state.families,
      bulletins: state.bulletins,
      runs: [...state.runs].reverse().map((r) => ({ ...r, totals: runTotals(r) })),
      batches: [...state.batches].reverse(),
      events: state.events.slice(-300).reverse(),
      chain: verifiedChain(state.events),
    });
  }));

  // Public transparency view: aggregates and the evidence chain, no PII.
  app.get("/api/public", wrap(async (req, res) => {
    const state = await store.read();
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=30");
    const items = state.batches.flatMap((b) => b.items.map((i) => ({ ...i, storm: b.storm })));
    // A Map, not an object: storm names come from the model, and a storm
    // called "__proto__" must not reach Object.prototype.
    const byStorm = new Map();
    for (const i of items) {
      if (!byStorm.has(i.storm)) byStorm.set(i.storm, { storm: i.storm, families: 0, sent: 0, pending: 0 });
      const s = byStorm.get(i.storm);
      s.families += 1;
      if (SUCCESS_STATES.has(i.status)) s.sent += i.amount;
      else s.pending += i.amount;
    }
    res.json({
      currency: POLICY.currency,
      paypalEnv: config.paypal.env,
      registered: state.families.filter((f) => f.status === "active").length,
      storms: [...byStorm.values()],
      batches: state.batches.map((b) => ({
        id: b.id,
        storm: b.storm,
        status: b.status,
        created_at: b.created_at,
        payout_batch_id: b.payout_batch_id,
        recipients: b.items.length,
        amount: b.items.reduce((s, i) => s + i.amount, 0),
        delivered: b.items.filter((i) => SUCCESS_STATES.has(i.status)).length,
      })),
      events: state.events.slice(-100).reverse().map(publicEvent),
      chain: verifiedChain(state.events),
    });
  }));

  app.post(
    "/api/families",
    coordinator,
    wrap(async (req, res) => {
      const b = req.body || {};
      const required = ["name", "municipality", "province", "paypal_email"];
      const missing = required.filter((k) => typeof b[k] !== "string" || !b[k].trim());
      if (missing.length) throw new HttpError(400, `missing ${missing.join(", ")}`);
      const name = text(b.name, "name", 100);
      const municipality = text(b.municipality, "municipality", 60);
      const province = text(b.province, "province", 60);
      const email = text(b.paypal_email, "paypal_email", 254);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "paypal_email is not an email");
      const size = Number(b.household_size);
      if (!Number.isInteger(size) || size < 1 || size > 30) throw new HttpError(400, "household_size must be 1-30");
      const family = {
        id: newId("fam"),
        name,
        municipality,
        province,
        household_size: size,
        vulnerability: Object.fromEntries(VULNERABILITY_FLAGS.map((k) => [k, b.vulnerability?.[k] === true])),
        status: "active",
        paypal_email: email,
        registered_at: new Date().toISOString(),
      };
      const shared = await store.mutate((state, log) => {
        const same = state.families.filter((f) => !f.demo_receiver && f.paypal_email.toLowerCase() === email.toLowerCase()).length;
        state.families.push(family);
        log("family.registered", req.actor, { municipality: family.municipality, province: family.province }, family.id);
        return same;
      });
      // Not blocked (households can share one PayPal account), but a coordinator
      // should see it: each family is paid separately.
      res.status(201).json(shared ? { ...family, warning: `this PayPal email is already used by ${shared} other famil${shared === 1 ? "y" : "ies"}` } : family);
    })
  );

  app.patch(
    "/api/families/:id",
    coordinator,
    wrap(async (req, res) => {
      const status = req.body?.status;
      if (!["active", "suspended"].includes(status)) throw new HttpError(400, "status must be active or suspended");
      const family = await store.mutate((state, log) => {
        const f = state.families.find((x) => x.id === req.params.id);
        if (!f) throw new HttpError(404, "family not found");
        if (f.status !== status) {
          f.status = status;
          log("family.status", req.actor, { status }, f.id);
        }
        return f;
      });
      res.json(family);
    })
  );

  app.post(
    "/api/bulletins",
    coordinator,
    wrap(async (req, res) => {
      if (typeof req.body?.text !== "string") throw new HttpError(400, "bulletin text must be a string");
      const body = req.body.text.trim();
      if (body.length < 40) throw new HttpError(400, "bulletin text is too short");
      if (body.length > 20000) throw new HttpError(400, "bulletin text is too long");
      const title = typeof req.body.title === "string" ? req.body.title.trim().slice(0, 120) : "";
      const bulletin = {
        id: newId("blt"),
        title: title || "Pasted bulletin",
        kind: "custom",
        source: "Pasted by coordinator",
        text: body,
        received_at: new Date().toISOString(),
      };
      await store.mutate((state, log) => {
        state.bulletins.push(bulletin);
        log("bulletin.received", req.actor, { title: bulletin.title }, bulletin.id);
      });
      res.status(201).json(bulletin);
    })
  );

  // Run the agent after the 202 has gone out. Progress is saved after every
  // step; the console polls /api/state to show it.
  async function runJob(runId, bulletin) {
    const snapshot = await store.read();
    const run = snapshot.runs.find((r) => r.id === runId);
    // Only a run that is still "running" in storage is ours to update: if the
    // stale-run check (or anything else) already closed it, leave it closed.
    const save = (extra) =>
      store.mutate((state, log) => {
        const i = state.runs.findIndex((r) => r.id === runId);
        if (i === -1 || state.runs[i].status !== "running") return;
        state.runs[i] = structuredClone(run);
        extra?.(log);
      });
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`the agent did not finish within ${RUN_DEADLINE_MS / 1000} seconds`)), RUN_DEADLINE_MS);
    });
    try {
      await Promise.race([runAgent({ state: snapshot, run, bulletin, client: aiClient, onProgress: () => save() }), deadline]);
      run.status = run.drafts.length ? "awaiting_approval" : "no_action";
      run.finished_at = new Date().toISOString();
      const totals = runTotals(run);
      await save((log) =>
        log("run.drafted", "agent", { storm: run.storm, areas: run.areas?.length || 0, ...totals, currency: POLICY.currency }, run.id)
      );
    } catch (e) {
      // Freeze what the agent did so far; a late step from the abandoned
      // loop must not change the failed run.
      const failed = { ...structuredClone(run), status: "failed", error: e.message, finished_at: new Date().toISOString() };
      await store.mutate((state, log) => {
        const i = state.runs.findIndex((r) => r.id === runId);
        if (i === -1 || state.runs[i].status !== "running") return;
        state.runs[i] = failed;
        log("run.failed", "agent", { message: e.message }, runId);
      });
      run.status = "failed";
    } finally {
      clearTimeout(timer);
    }
  }

  app.post(
    "/api/bulletins/:id/runs",
    coordinator,
    wrap(async (req, res) => {
      if (!aiClient && !config.ai.configured) {
        const key = config.ai.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
        throw new HttpError(503, `AI is not configured: set ${key} on the server`);
      }
      const { run, bulletin } = await store.mutate((state, log) => {
        const bulletin = state.bulletins.find((b) => b.id === req.params.id);
        if (!bulletin) throw new HttpError(404, "bulletin not found");
        const now = Date.now();
        for (const r of state.runs) {
          if (r.status === "running" && now - Date.parse(r.started_at) > STALE_RUN_MS) {
            r.status = "failed";
            r.error = "the agent stopped responding (timed out)";
            r.finished_at = new Date(now).toISOString();
            log("run.failed", "agent", { message: r.error }, r.id);
          }
        }
        if (state.runs.some((r) => r.status === "running")) throw new HttpError(409, "an agent run is already in progress");
        const lastHour = state.runs.filter((r) => now - Date.parse(r.started_at) < 3600_000).length;
        if (lastHour >= config.agentRunsPerHour) throw new HttpError(429, "agent run limit reached for this hour");

        const run = {
          id: newId("run"),
          bulletin_id: bulletin.id,
          bulletin_title: bulletin.title,
          status: "running",
          model: config.ai.model,
          started_by: req.actor,
          started_at: new Date(now).toISOString(),
          finished_at: null,
          storm: null,
          bulletin_number: null,
          areas: null,
          drafts: [],
          steps: [],
          summary: null,
          error: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        };
        state.runs.push(run);
        log("run.started", req.actor, { bulletin: bulletin.title, model: run.model }, run.id);
        return { run, bulletin };
      });
      res.status(202).json(run);
      // On Vercel, waitUntil keeps the function alive until the job ends;
      // on a normal server the promise simply runs to completion.
      waitUntil(runJob(run.id, bulletin).catch((e) => console.error("agent job crashed", e)));
    })
  );

  app.post(
    "/api/runs/:id/approve",
    coordinator,
    wrap(async (req, res) => {
      const batch = await approveRun(store, req.params.id, req.actor);
      res.json(batch);
    })
  );

  // Drop one draft (e.g. a family suspended since the agent ran) instead of
  // rejecting the whole run.
  app.delete(
    "/api/runs/:id/drafts/:familyId",
    coordinator,
    wrap(async (req, res) => {
      const run = await store.mutate((state, log) => {
        const r = state.runs.find((x) => x.id === req.params.id);
        if (!r) throw new HttpError(404, "run not found");
        if (r.status !== "awaiting_approval") throw new HttpError(409, `run is ${r.status}, not awaiting approval`);
        const before = r.drafts.length;
        r.drafts = r.drafts.filter((d) => d.family_id !== req.params.familyId);
        if (r.drafts.length === before) throw new HttpError(404, "no draft for that family");
        if (!r.drafts.length) r.status = "no_action";
        log("run.draft_removed", req.actor, { ...runTotals(r), currency: POLICY.currency }, r.id);
        return r;
      });
      res.json({ ...run, totals: runTotals(run) });
    })
  );

  app.post(
    "/api/runs/:id/reject",
    coordinator,
    wrap(async (req, res) => {
      res.json(await rejectRun(store, req.params.id, req.actor, String(req.body?.reason || "").slice(0, 300)));
    })
  );

  app.post(
    "/api/batches/:id/refresh",
    coordinator,
    wrap(async (req, res) => {
      res.json(await refreshBatch(store, req.params.id));
    })
  );

  app.post(
    "/api/webhooks/paypal",
    wrap(async (req, res) => {
      const event = req.body;
      if (!event?.id || !event?.event_type) throw new HttpError(400, "not a PayPal webhook event");
      if (config.paypal.webhookId) {
        const sent = Date.parse(req.get("paypal-transmission-time") || "");
        if (Number.isFinite(sent) && Date.now() - sent > WEBHOOK_MAX_AGE_MS) throw new HttpError(400, "webhook delivery is too old");
        const ok = await verifyWebhookSignature(req.headers, event);
        if (!ok) {
          // Not written to the evidence log: anyone can post here, and the
          // public log should only hold events PayPal actually sent.
          console.warn(`webhook rejected: ${event.event_type} ${String(event.id).slice(0, 80)}`);
          throw new HttpError(400, "webhook signature verification failed");
        }
      } else if (process.env.ALLOW_UNVERIFIED_WEBHOOKS !== "1") {
        throw new HttpError(503, "webhooks are not configured: set PAYPAL_WEBHOOK_ID");
      }
      await store.mutate((state, log) => {
        const outcome = applyWebhookEvent(state, log, event);
        // Events for batches this app didn't send (e.g. the smoke test) are
        // acknowledged but kept out of the log.
        if (outcome.batch) log("webhook.received", "paypal", { event_type: event.event_type, id: event.id, ...outcome });
      });
      res.json({ ok: true });
    })
  );

  app.use("/api", (req, res) => res.status(404).json({ error: "not found" }));

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
    app.get("/{*path}", (req, res) => res.sendFile(path.join(staticDir, "index.html")));
  }

  // eslint-disable-next-line no-unused-vars
  // Only HttpErrors carry a message meant for the caller. Everything else
  // (database, SDK, PayPal internals) is logged and answered generically.
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({
        error: err.message,
        ...(err.violations ? { violations: err.violations } : {}),
        ...(err.debugId ? { debugId: err.debugId } : {}),
      });
    }
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "request body is not valid JSON" });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "request body is too large" });
    console.error(err);
    if (err instanceof PayPalError) {
      return res.status(502).json({ error: "PayPal request failed", ...(err.debugId ? { debugId: err.debugId } : {}) });
    }
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
