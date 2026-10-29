// HTTP API. createApp() takes its dependencies so tests can run it with an
// in-memory store and a fake LLM client. Nothing is kept in process memory
// between requests, so the same app runs as a long-lived server or as a
// serverless function (Vercel).

import express from "express";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { config, publicConfig } from "./config.js";
import { POLICY, VULNERABILITY_FLAGS, runTotals } from "./policy.js";
import { runAgent } from "./agent.js";
import { approveRun, rejectRun, refreshBatch, applyWebhookEvent, HttpError } from "./payouts.js";
import { waitUntil } from "@vercel/functions";
import { verifyWebhookSignature } from "./paypal.js";
import { newId, verifyChain } from "./store.js";

const SUCCESS_STATES = new Set(["SUCCESS"]);

// A run still "running" after this long died with its function instance
// (Vercel caps a function at 300s).
const STALE_RUN_MS = 6 * 60_000;

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createApp({ store, aiClient, staticDir, coordinatorKey = config.coordinatorKey } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "200kb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  function coordinator(req, res, next) {
    if (coordinatorKey && !sameSecret(req.get("x-coordinator-key") || "", coordinatorKey)) {
      return res.status(401).json({ error: "coordinator key required" });
    }
    req.actor = (req.get("x-coordinator-name") || "coordinator").slice(0, 60);
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
      chain: verifyChain(state.events),
    });
  }));

  // Public transparency view: aggregates and the evidence chain, no PII.
  app.get("/api/public", wrap(async (req, res) => {
    const state = await store.read();
    const items = state.batches.flatMap((b) => b.items.map((i) => ({ ...i, storm: b.storm })));
    const byStorm = {};
    for (const i of items) {
      const s = (byStorm[i.storm] ||= { storm: i.storm, families: 0, sent: 0, pending: 0 });
      s.families += 1;
      if (SUCCESS_STATES.has(i.status)) s.sent += i.amount;
      else s.pending += i.amount;
    }
    res.json({
      currency: POLICY.currency,
      paypalEnv: config.paypal.env,
      registered: state.families.filter((f) => f.status === "active").length,
      storms: Object.values(byStorm),
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
      events: state.events.slice(-100).reverse().map(({ detail, ...e }) => ({
        ...e,
        detail: { ...detail, receiver: undefined },
      })),
      chain: verifyChain(state.events),
    });
  }));

  app.post(
    "/api/families",
    coordinator,
    wrap(async (req, res) => {
      const b = req.body || {};
      const required = ["name", "municipality", "province", "paypal_email"];
      const missing = required.filter((k) => !String(b[k] || "").trim());
      if (missing.length) throw new HttpError(400, `missing ${missing.join(", ")}`);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.paypal_email)) throw new HttpError(400, "paypal_email is not an email");
      const size = Number(b.household_size);
      if (!Number.isInteger(size) || size < 1 || size > 30) throw new HttpError(400, "household_size must be 1-30");
      const family = {
        id: newId("fam"),
        name: b.name.trim(),
        municipality: b.municipality.trim(),
        province: b.province.trim(),
        household_size: size,
        vulnerability: Object.fromEntries(VULNERABILITY_FLAGS.map((k) => [k, Boolean(b.vulnerability?.[k])])),
        status: "active",
        paypal_email: b.paypal_email.trim(),
        registered_at: new Date().toISOString(),
      };
      await store.mutate((state, log) => {
        state.families.push(family);
        log("family.registered", req.actor, { municipality: family.municipality, province: family.province }, family.id);
      });
      res.status(201).json(family);
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
      const text = String(req.body?.text || "").trim();
      if (text.length < 40) throw new HttpError(400, "bulletin text is too short");
      if (text.length > 20000) throw new HttpError(400, "bulletin text is too long");
      const bulletin = {
        id: newId("blt"),
        title: String(req.body?.title || "").trim().slice(0, 120) || "Pasted bulletin",
        kind: "custom",
        source: "Pasted by coordinator",
        text,
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
    const save = (extra) =>
      store.mutate((state, log) => {
        const i = state.runs.findIndex((r) => r.id === runId);
        state.runs[i] = structuredClone(run);
        extra?.(log);
      });
    try {
      await runAgent({ state: snapshot, run, bulletin, client: aiClient, onProgress: () => save() });
      run.status = run.drafts.length ? "awaiting_approval" : "no_action";
      run.finished_at = new Date().toISOString();
      const totals = runTotals(run);
      await save((log) =>
        log("run.drafted", "agent", { storm: run.storm, areas: run.areas?.length || 0, ...totals, currency: POLICY.currency }, run.id)
      );
    } catch (e) {
      run.status = "failed";
      run.error = e.message;
      run.finished_at = new Date().toISOString();
      await save((log) => log("run.failed", "agent", { message: e.message }, run.id));
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
  app.use((err, req, res, next) => {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500 && !(err instanceof HttpError)) console.error(err);
    res.status(status).json({
      error: err.message || "internal error",
      ...(err.violations ? { violations: err.violations } : {}),
      ...(err.debugId ? { debugId: err.debugId } : {}),
    });
  });

  return app;
}
