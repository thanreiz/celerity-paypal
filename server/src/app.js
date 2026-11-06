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
import { PayPalError, captureOrder, createOrder, verifyWebhookSignature } from "./paypal.js";
import { farmerLink, farmerView, maskEmail, newLinkToken, smsText } from "./notify.js";
import { FUND_LIMITS, addPendingContribution, allocateRun, completeContribution, poolLedger, poolTotals } from "./funding.js";
import { newId, verifyChain } from "./store.js";
import { FUNDERS, RULE_LIMITS, checkPoolRule, funderById, funderView, normalizedRule } from "./funders.js";
import { draftPoolRule, helpFarmer, stormStatus } from "./agents.js";
import { JEV_THRESHOLDS, triageFarmerMessage } from "./jev.js";

// Jev's message topics -> the case topics a coordinator sees.
const CASE_FOR_TOPIC = { payout_status: "not_received", cash_out_help: "cash_out_help", damage_report: "damage_report", wrong_details: "wrong_details" };
import { autoRelease, draftByRules, routeBulletin } from "./rules.js";

const SUCCESS_STATES = new Set(["SUCCESS"]);

// What the public transparency page may show of each evidence entry. Anything
// not listed (receiver emails, error payloads, free text typed by
// coordinators, family ids) stays coordinator-only.
const PUBLIC_DETAIL = {
  "family.registered": ["municipality", "province"],
  "family.status": ["status"],
  "bulletin.received": ["title"],
  "run.started": ["bulletin", "model", "mode"],
  "run.drafted": ["storm", "areas", "recipients", "amount", "currency", "mode"],
  "case.opened": ["topic"],
  "run.failed": [],
  "run.rejected": [],
  "run.draft_removed": ["recipients", "amount", "currency"],
  "run.approved": ["recipients", "amount", "currency"],
  "payout.submitting": ["recipients", "amount", "currency", "pools"],
  "pool.created": ["name", "funder", "provinces", "min_signal"],
  "farmer.notified": ["count", "channel"],
  "pool.funded": ["pool", "funder_name", "amount", "currency"],
  "payout.resumed": [],
  "payout.unconfirmed": [],
  "payout.error": ["name", "debugId"],
  "payout.batch_created": ["payout_batch_id", "batch_status"],
  "payout.batch_status": ["payout_batch_id", "batch_status"],
  "payout.item_status": ["status"],
  "webhook.received": ["event_type"],
};
const SYSTEM_ACTORS = new Set(["agent", "rules", "jev", "paypal", "paypal-webhook", "paypal-poll", "system", "funder", "farmer"]);
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
function limiter(limit, windowMs) {
  const hits = new Map();
  return {
    over(ip, now = Date.now()) {
      const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
      hits.set(ip, recent);
      return recent.length >= limit;
    },
    note(ip) {
      hits.get(ip).push(Date.now());
      if (hits.size > 10_000) hits.delete(hits.keys().next().value);
    },
  };
}
const failedAuth = limiter(10, 10 * 60_000);
// Checkout orders anyone can start from the public page.
const fundStarts = limiter(10, 10 * 60_000);
// Wrong farmer links: slows anyone trying to guess one.
const linkMisses = limiter(20, 10 * 60_000);
// AI calls anyone can start from the two apps: per client, and in total.
const aiCalls = limiter(15, 60 * 60_000);
const aiCallsAll = limiter(Number(process.env.APP_AI_CALLS_PER_HOUR) || 200, 60 * 60_000);
function aiBudget(req) {
  const ip = clientIp(req);
  if (aiCalls.over(ip) || aiCallsAll.over("all")) throw new HttpError(429, "the assistant is busy; try again later");
  aiCalls.note(ip);
  aiCallsAll.note("all");
}
const clientIp = (req) => req.get("x-forwarded-for")?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";

// Where PayPal sends a funder back after Checkout.
const baseUrl = (req) =>
  (process.env.PUBLIC_URL || `${req.get("x-forwarded-proto") || req.protocol}://${req.get("x-forwarded-host") || req.get("host")}`).replace(/\/$/, "");

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
      const ip = clientIp(req);
      if (failedAuth.over(ip)) return res.status(429).json({ error: "too many wrong keys; try again in a few minutes" });
      const given = req.get("x-coordinator-key") || "";
      if (!sameSecret(given, coordinatorKey)) {
        failedAuth.note(ip);
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
    let state = await store.read();
    // Families registered before farmer links existed get one, once.
    if (state.families.some((f) => !f.link_token)) {
      await store.mutate((s) => {
        for (const f of s.families) f.link_token ||= newLinkToken();
      });
      state = await store.read();
    }
    const base = baseUrl(req);
    const famById = Object.fromEntries(state.families.map((f) => [f.id, f]));
    const runById = Object.fromEntries(state.runs.map((r) => [r.id, r]));
    res.json({
      config: publicConfig(POLICY),
      families: state.families,
      bulletins: state.bulletins,
      runs: [...state.runs].reverse().map((r) => ({ ...r, totals: runTotals(r), funding: r.status === "awaiting_approval" ? fundingPreview(state, r) : undefined })),
      // Each item carries the SMS its family got (simulated sending).
      batches: [...state.batches].reverse().map((b) => ({
        ...b,
        items: b.items.map((it) => {
          const f = famById[it.family_id];
          return f?.link_token ? { ...it, sms: smsText(f, it, runById[b.run_id], farmerLink(base, f.link_token)) } : it;
        }),
      })),
      pools: poolLedger(state),
      cases: [...(state.cases || [])].reverse(),
      events: state.events.slice(-300).reverse(),
      chain: verifiedChain(state.events),
    });
  }));

  // Which funders would pay for a run if it were approved now.
  function fundingPreview(state, run) {
    const { allocations, shortfalls } = allocateRun(state, run);
    return { pools: poolTotals(allocations), shortfalls };
  }

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
      pools: poolLedger(state),
      events: state.events.slice(-100).reverse().map(publicEvent),
      chain: verifiedChain(state.events),
    });
  }));

  // --- The farmer's private link ----------------------------------------------------

  // No coordinator key: the unguessable token in the link is the credential,
  // and it opens only that family's own sent payouts.
  async function familyByToken(req) {
    const ip = clientIp(req);
    if (linkMisses.over(ip)) throw new HttpError(429, "too many tries; try again in a few minutes");
    const token = String(req.params.token || "");
    const state = await store.read();
    const family = token.length >= 20 && state.families.find((f) => f.link_token && sameSecret(f.link_token, token));
    if (!family) {
      linkMisses.note(ip);
      throw new HttpError(404, "link not found");
    }
    return { state, family };
  }

  app.get(
    "/api/me/:token",
    wrap(async (req, res) => {
      const { state, family } = await familyByToken(req);
      res.json({
        ...farmerView(state, family),
        registration: {
          status: family.status,
          household_size: family.household_size,
          paypal_email: maskEmail(family.paypal_email),
          registered_at: family.registered_at,
        },
        storm_status: stormStatus(state, family),
        cases: (state.cases || []).filter((c) => c.family_id === family.id).map(({ topic, status, at }) => ({ topic, status, at })),
      });
    })
  );

  // The farmer's helper agent. Reads only this family's record; can open a
  // case for a coordinator; cannot move money.
  app.post(
    "/api/me/:token/help",
    wrap(async (req, res) => {
      const raw = req.body?.messages;
      if (!Array.isArray(raw) || !raw.length || raw.length > 12) throw new HttpError(400, "messages must be a list of 1 to 12 messages");
      const messages = raw.map((m) => ({ role: m?.role === "helper" ? "helper" : "farmer", text: text(m?.text, "message text", 600) }));
      if (messages.at(-1).role !== "farmer") throw new HttpError(400, "the last message must be the farmer's");
      if (!aiClient && !config.ai.configured) throw new HttpError(503, "the helper is not available right now");
      const { state, family } = await familyByToken(req);
      aiBudget(req);
      // Jev triages first (~0.3 s): the topic steers GPT, and a confident
      // "a person must follow up" opens a case even if GPT doesn't.
      const triage = await triageFarmerMessage({ messages });
      // Only where a person is the answer (damage, wrong details) at 0.7, or
      // anything Jev is near-sure about at 0.9: "where is my money?" is
      // answered from the record, not by opening a case.
      if (triage) {
        const personTopic = triage.topic === "damage_report" || triage.topic === "wrong_details";
        triage.flag = triage.needsHuman >= (personTopic ? JEV_THRESHOLDS.needsHuman : 0.9);
      }
      let pending = null;
      const out = await helpFarmer({
        state,
        family,
        messages,
        triage,
        client: aiClient,
        openCase: (topic, summary) => {
          pending = { topic, summary };
        },
      });
      if (!pending && triage?.flag) {
        pending = {
          topic: CASE_FOR_TOPIC[triage.topic] || "other",
          summary: `Flagged by Jev (${Math.round(triage.needsHuman * 100)}%): "${messages.at(-1).text.slice(0, 200)}"`,
        };
      }
      if (pending) {
        await store.mutate((s, log) => {
          s.cases ||= [];
          if (s.cases.filter((c) => c.family_id === family.id && c.status === "open").length >= 5) return;
          const c = { id: newId("case"), family_id: family.id, topic: pending.topic, summary: pending.summary, status: "open", at: new Date().toISOString() };
          s.cases.push(c);
          log("case.opened", "farmer", { topic: c.topic }, c.id);
        });
      }
      res.json({
        reply: out.reply,
        case: pending ? { topic: pending.topic } : null,
        triage: triage ? { topic: triage.topic, needs_human: triage.needsHuman, model: triage.model, ms: triage.ms } : null,
      });
    })
  );

  // Demo farmers for the Farmer app's "Is this you?" screen: only seeded
  // demo families (fictional), never anyone registered through the console.
  app.get(
    "/api/demo/farmers",
    wrap(async (req, res) => {
      if (process.env.DEMO_FARMERS === "0") return res.json({ farmers: [] });
      const state = await store.read();
      const seeded = state.families.filter((f) => /^fam_\d{3}$/.test(f.id) && f.status === "active" && f.link_token);
      res.json({
        farmers: seeded.map((f) => ({ name: f.name, municipality: f.municipality, province: f.province, token: f.link_token })),
      });
    })
  );

  // --- The Funder app ---------------------------------------------------------------

  app.get("/api/funders", (req, res) => res.json({ funders: FUNDERS }));

  const funderOr404 = (id) => {
    const f = funderById(String(id || ""));
    if (!f) throw new HttpError(404, "funder not found");
    return f;
  };

  app.get(
    "/api/funders/:id",
    wrap(async (req, res) => {
      const f = funderOr404(req.params.id);
      res.json({ ...funderView(await store.read(), f.id), limits: FUND_LIMITS, rule_limits: RULE_LIMITS, policy_min_signal: POLICY.minSignal });
    })
  );

  // The pool-rule agent: plain words in, a checked rule proposal out.
  // Nothing is created until the funder confirms with POST .../pools.
  app.post(
    "/api/funders/:id/pool-drafts",
    wrap(async (req, res) => {
      const f = funderOr404(req.params.id);
      const words = text(req.body?.text, "text", RULE_LIMITS.ruleTextMax);
      if (!aiClient && !config.ai.configured) throw new HttpError(503, "the pool assistant is not available right now");
      aiBudget(req);
      const out = await draftPoolRule({ state: await store.read(), funderId: f.id, text: words, client: aiClient });
      res.json({ proposal: out.proposal, note: out.note, steps: out.steps, model: out.model });
    })
  );

  app.post(
    "/api/funders/:id/pools",
    wrap(async (req, res) => {
      const f = funderOr404(req.params.id);
      const ip = clientIp(req);
      if (fundStarts.over(ip)) throw new HttpError(429, "too many requests; try again in a few minutes");
      const b = req.body || {};
      const rule = { name: b.name, provinces: b.provinces, min_signal: b.min_signal };
      const ruleText = typeof b.rule_text === "string" ? b.rule_text.trim().slice(0, RULE_LIMITS.ruleTextMax) : null;
      const notEnforced = Array.isArray(b.not_enforced) ? b.not_enforced.slice(0, 8).map((x) => String(x).slice(0, 200)) : [];
      fundStarts.note(ip);
      const pool = await store.mutate((state, log) => {
        const problems = checkPoolRule(state, f.id, rule);
        if (problems.length) throw new HttpError(400, problems.join("; "));
        const r = normalizedRule(rule);
        const pool = {
          id: newId("pool"),
          name: r.name,
          funder: f.name,
          funder_id: f.id,
          provinces: r.provinces,
          min_signal: r.min_signal,
          rule_text: ruleText,
          not_enforced: notEnforced,
          hazard: "typhoon",
          created_at: new Date().toISOString(),
        };
        state.pools.push(pool);
        log("pool.created", "funder", { name: pool.name, funder: f.name, provinces: pool.provinces, min_signal: pool.min_signal }, pool.id);
        return pool;
      });
      res.status(201).json(pool);
    })
  );

  // --- Step 1: funders and pools ------------------------------------------------

  app.get("/api/pools", wrap(async (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=30");
    res.json({ currency: POLICY.currency, limits: FUND_LIMITS, pools: poolLedger(await store.read()) });
  }));

  app.post(
    "/api/pools",
    coordinator,
    wrap(async (req, res) => {
      const b = req.body || {};
      const name = text(b.name, "name", 80);
      const funder = text(b.funder, "funder", 80);
      if (b.provinces != null && !Array.isArray(b.provinces)) throw new HttpError(400, "provinces must be a list");
      const provinces = (b.provinces || []).map((p) => text(p, "province", 60));
      if (provinces.length > 30) throw new HttpError(400, "at most 30 provinces");
      const pool = { id: newId("pool"), name, funder, provinces, hazard: "typhoon", created_at: new Date().toISOString() };
      await store.mutate((state, log) => {
        state.pools.push(pool);
        log("pool.created", req.actor, { name, funder, provinces }, pool.id);
      });
      res.status(201).json(pool);
    })
  );

  // Anyone can fund a pool: this starts a PayPal Checkout and returns the
  // PayPal page to send the funder to. Nothing is credited until PayPal
  // reports the capture (return redirect or webhook).
  app.post(
    "/api/pools/:id/fund",
    wrap(async (req, res) => {
      const ip = clientIp(req);
      if (fundStarts.over(ip)) throw new HttpError(429, "too many checkouts started; try again in a few minutes");
      const funderName = text(req.body?.funder_name, "funder_name", 80);
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount < FUND_LIMITS.min || amount > FUND_LIMITS.max) {
        throw new HttpError(400, `amount must be between ${FUND_LIMITS.min} and ${FUND_LIMITS.max} ${POLICY.currency}`);
      }
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) throw new HttpError(400, "amount has more than 2 decimals");
      const pool = (await store.read()).pools.find((p) => p.id === req.params.id);
      if (!pool) throw new HttpError(404, "pool not found");
      fundStarts.note(ip);

      const base = baseUrl(req);
      const order = await createOrder({
        amount,
        currency: POLICY.currency,
        poolId: pool.id,
        poolName: pool.name,
        returnUrl: `${base}/api/fund/return${req.body?.return_to === "funder" ? "?to=funder" : ""}`,
        cancelUrl: `${base}/api/fund/cancel${req.body?.return_to === "funder" ? "?to=funder" : ""}`,
        requestId: newId("fund"),
      });
      await store.mutate((state) => addPendingContribution(state, { pool, funderName, amount, orderId: order.id }));
      res.status(201).json({ approveUrl: order.approveUrl, order_id: order.id });
    })
  );

  // PayPal sends the funder here after they approve (with ?token=ORDER_ID).
  app.get(
    "/api/fund/return",
    wrap(async (req, res) => {
      const back = (q) => res.redirect(302, `${baseUrl(req)}/#/${req.query.to === "funder" ? "funder" : "public"}?${q}`);
      const orderId = String(req.query.token || "");
      const pending = (await store.read()).contributions.find((k) => k.order_id === orderId);
      if (!orderId || !pending) return back("funded=unknown");
      let capture;
      try {
        capture = await captureOrder(orderId);
      } catch (e) {
        console.error("capture failed", e);
        return back("funded=failed");
      }
      const outcome = await store.mutate((state, log) => completeContribution(state, log, { ...capture, source: "paypal" }));
      if (outcome.funded || outcome.duplicate) return back(`funded=${encodeURIComponent(pending.pool_id)}&amount=${pending.amount}`);
      return back("funded=failed");
    })
  );

  app.get(
    "/api/fund/cancel",
    wrap(async (req, res) => {
      const orderId = String(req.query.token || "");
      await store.mutate((state) => {
        const k = state.contributions.find((x) => x.order_id === orderId && x.status === "pending");
        if (k) k.status = "cancelled";
      });
      res.redirect(302, `${baseUrl(req)}/#/${req.query.to === "funder" ? "funder" : "public"}?funded=cancelled`);
    })
  );

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
        link_token: newLinkToken(),
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
  async function runJob(runId, bulletin, parsed, jev) {
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
      await Promise.race([runAgent({ state: snapshot, run, bulletin, parsed, jev, client: aiClient, onProgress: () => save() }), deadline]);
      run.status = run.drafts.length ? "awaiting_approval" : "no_action";
      run.finished_at = new Date().toISOString();
      const totals = runTotals(run);
      await save((log) =>
        log("run.drafted", "agent", { storm: run.storm, areas: run.areas?.length || 0, ...totals, currency: POLICY.currency, mode: "agent" }, run.id)
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

  // Celerity decides how a bulletin is handled. A routine bulletin the rules
  // read completely is drafted by policy alone and released without waiting
  // (AUTO_RELEASE). Anything the rules can't place goes to the AI agent, and
  // a coordinator approves what it drafts. { mode: "agent" } forces the agent.
  app.post(
    "/api/bulletins/:id/runs",
    coordinator,
    wrap(async (req, res) => {
      const found = (await store.read()).bulletins.find((b) => b.id === req.params.id);
      if (!found) throw new HttpError(404, "bulletin not found");
      // Parser first, then Jev for what the parser left (outside any lock:
      // each can take a few seconds).
      const { route, parsed, jev, hold } = await routeBulletin(found.text, { forceAgent: req.body?.mode === "agent" });
      const useRules = route === "rules" || route === "jev";
      if (!useRules && !aiClient && !config.ai.configured) {
        const key = config.ai.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
        throw new HttpError(503, `this bulletin needs the AI agent, which is not configured: set ${key} on the server`);
      }
      const parseNote = { confidence: parsed.confidence, unparsed: parsed.unparsed, parsed_by: parsed.parsed_by };
      const jevNote = jev ? { model: jev.model, ms: jev.ms, injection: jev.injection, placements: jev.placements, hold } : null;
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
        if (lastHour >= config.agentRunsPerHour) throw new HttpError(429, "run limit reached for this hour");

        const run = {
          id: newId("run"),
          bulletin_id: bulletin.id,
          bulletin_title: bulletin.title,
          mode: useRules ? route : "agent",
          parse: parseNote,
          jev: jevNote,
          status: "running",
          model: useRules ? null : config.ai.model,
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
        log("run.started", req.actor, { bulletin: bulletin.title, model: run.model, mode: run.mode }, run.id);
        if (useRules) {
          draftByRules(state, run, parsed);
          run.status = run.drafts.length ? "awaiting_approval" : "no_action";
          run.finished_at = new Date().toISOString();
          run.steps.push({ at: run.finished_at, kind: "note", text: `Read by the ${parsed.parsed_by === "java-core" ? "Java core" : "rules"} parser: ${parsed.areas.length} area(s), nothing left for AI.` });
          if (route === "jev") {
            for (const pl of jev.placements) {
              run.steps.push({ at: run.finished_at, kind: "note", text: `Jev placed "${pl.phrase}" as all of ${pl.province} (${Math.round(pl.p * 100)}% sure, ${Math.round(pl.whole * 100)}% whole province).` });
            }
          }
          if (hold) run.steps.push({ at: run.finished_at, kind: "note", text: `${hold}: held for a coordinator.` });
          log("run.drafted", route, { storm: run.storm, areas: run.areas.length, ...runTotals(run), currency: POLICY.currency, mode: route }, run.id);
        }
        state.runs.push(run);
        return { run, bulletin };
      });

      if (run.mode === "rules" || run.mode === "jev") {
        const release = run.status === "awaiting_approval" && autoRelease() && !hold;
        res.status(201).json({ ...run, totals: runTotals(run), auto_release: release });
        // No AI touched this run, so it is released at once; if PayPal or a
        // re-check refuses, it waits for a coordinator like any other run.
        if (release) waitUntil(approveRun(store, run.id, run.mode).catch((e) => console.warn(`auto-release of ${run.id} held: ${e.message}`)));
        return;
      }
      res.status(202).json(run);
      // On Vercel, waitUntil keeps the function alive until the job ends;
      // on a normal server the promise simply runs to completion.
      waitUntil(runJob(run.id, bulletin, parsed, jev).catch((e) => console.error("agent job crashed", e)));
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
        if (outcome.batch || outcome.funded) log("webhook.received", "paypal", { event_type: event.event_type, id: event.id, ...outcome });
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
