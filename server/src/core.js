// Client for the Java core (core/), which holds the same deterministic money
// rules as policy.js and funding.js. CORE_MODE decides who answers:
//   off     only the rules in this process (default)
//   shadow  this process decides; the core is asked too and any difference is
//           logged, so the two can be compared on real traffic
//   on      the core decides; if it can't be reached, this process does
// Only what the rules read is sent: no names, and the PayPal email becomes a
// yes/no flag. An answer in the wrong shape counts as no answer.

import { createHash } from "node:crypto";
import { POLICY, cents, checkDraft as localCheckDraft } from "./policy.js";
import { allocateRun as localAllocateRun, creditedCents } from "./funding.js";

const TIMEOUT_MS = 3000;

const mode = () => {
  const m = (process.env.CORE_MODE || "off").toLowerCase();
  return process.env.CORE_URL && (m === "shadow" || m === "on") ? m : "off";
};

export const active = () => mode() !== "off";

/** The slice of state the core's rules read. */
export function coreState(state) {
  return {
    families: state.families.map((f) => ({
      id: f.id,
      municipality: f.municipality,
      province: f.province,
      household_size: f.household_size,
      vulnerability: f.vulnerability,
      status: f.status,
      paypal_email: Boolean(f.paypal_email),
    })),
    batches: state.batches.map((b) => ({
      storm: b.storm,
      created_at: b.created_at,
      items: b.items.map((i) => ({ family_id: i.family_id, status: i.status, funding: i.funding })),
    })),
    pools: (state.pools || []).map((p) => ({ id: p.id, provinces: p.provinces, ...(p.min_signal ? { min_signal: p.min_signal } : {}) })),
    // The core knows only amount and status, so a contribution is sent as
    // what it actually puts in the pool: net of PayPal's fee and refunds.
    contributions: (state.contributions || []).map((c) => ({ pool_id: c.pool_id, amount: creditedCents(c) / 100, status: c.status })),
  };
}

async function call(op, body) {
  const res = await fetch(`${process.env.CORE_URL.replace(/\/$/, "")}/v1/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-core-token": process.env.CORE_TOKEN || "" },
    body: JSON.stringify({ currency: POLICY.currency, ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`core ${op} answered ${res.status}`);
  return res.json();
}

/** JSON with sorted keys and no null/undefined members, so 70 and 70.0 or a
 * missing key and null compare equal. */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .filter((k) => v[k] != null)
        .map((k) => [k, canon(v[k])])
    );
  }
  return v;
}
export const sameAnswer = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const fingerprint = (body) => createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 12);

async function decide(op, body, local, fromRemote) {
  const m = mode();
  if (m === "off") return local();
  if (m === "shadow") {
    const answer = local();
    try {
      const remote = fromRemote(await call(op, body));
      if (!sameAnswer(answer, remote)) console.warn(`core shadow mismatch on ${op} (input ${fingerprint(body)})`);
    } catch (e) {
      console.warn(`core shadow call failed on ${op}: ${e.message}`);
    }
    return answer;
  }
  try {
    return fromRemote(await call(op, body));
  } catch (e) {
    console.warn(`core unreachable on ${op}, using the local rules: ${e.message}`);
    return local();
  }
}

function draftErrors(r) {
  if (!Array.isArray(r?.errors) || !r.errors.every((e) => typeof e === "string")) throw new Error("malformed check-draft answer");
  return r.errors;
}

/** A split must pay each draft in full unless the draft is a shortfall, or
 * the payout's funding would not add up. */
function runAllocation(r, run) {
  const { allocations, shortfalls } = r || {};
  if (!allocations || typeof allocations !== "object" || !Array.isArray(shortfalls)) throw new Error("malformed allocate answer");
  const short = new Set(shortfalls.map((x) => x?.family_id));
  for (const d of run.drafts) {
    if (short.has(d.family_id)) continue;
    const split = allocations[d.family_id];
    const whole =
      Array.isArray(split) &&
      split.every((s) => typeof s?.pool_id === "string" && Number.isFinite(s.amount) && s.amount > 0) &&
      split.reduce((sum, s) => sum + cents(s.amount), 0) === cents(d.amount);
    if (!whole) throw new Error(`allocate answer does not cover ${d.family_id}`);
  }
  return { allocations, shortfalls };
}

/** Policy violations for one draft (empty = OK). */
export function checkDraft(state, run, draft) {
  return decide(
    "policy/check-draft",
    { state: coreState(state), run: { storm: run.storm, areas: run.areas, drafts: run.drafts }, draft },
    () => localCheckDraft(state, run, draft),
    draftErrors
  );
}

/** The split of each draft across the funders' pools. */
export function allocateRun(state, run) {
  return decide(
    "funding/allocate",
    { state: coreState(state), run: { ...(Array.isArray(run.areas) ? { areas: run.areas } : {}), drafts: run.drafts } },
    () => localAllocateRun(state, run),
    (r) => runAllocation(r, run)
  );
}

// What the answers depend on, so a change between asking and claiming shows.
const inputsKey = (state, run) =>
  fingerprint(canon({ state: coreState(state), run: { storm: run.storm, areas: run.areas, drafts: run.drafts } }));

/**
 * Ask for every answer an approval needs. Call this with no lock held: each
 * call can take up to TIMEOUT_MS, and a lock would block webhooks and funders
 * meanwhile. Calls run side by side, so a run waits one timeout at most.
 */
export async function prepareApproval(state, run) {
  const [checks, allocation] = await Promise.all([
    Promise.all(run.drafts.map((d) => checkDraft(state, run, d))),
    allocateRun(state, run),
  ]);
  return { key: inputsKey(state, run), checks, allocation };
}

/**
 * The answers to apply inside the lock, against current state. Prepared
 * answers count only if nothing they depend on has changed; otherwise the
 * local rules decide on the current state, as they do when the core is down.
 */
export function approvalAnswers(state, run, prepared) {
  if (prepared?.key === inputsKey(state, run)) return prepared;
  if (prepared) console.warn("core answers went stale during approval, using the local rules");
  return { checks: run.drafts.map((d) => localCheckDraft(state, run, d)), allocation: localAllocateRun(state, run) };
}

function parseAnswer(r) {
  const area = (a) => typeof a?.province === "string" && (a.municipality == null || typeof a.municipality === "string") && Number.isInteger(a.signal_level);
  if (!r || !Array.isArray(r.areas) || !r.areas.every(area) || !Array.isArray(r.unparsed) || typeof r.confidence !== "number") {
    throw new Error("malformed parse answer");
  }
  return {
    storm: r.storm ?? null,
    bulletin_number: r.bulletin_number ?? null,
    areas: r.areas.map((a) => ({ province: a.province, municipality: a.municipality ?? null, signal_level: a.signal_level })),
    unparsed: r.unparsed.map(String),
    confidence: r.confidence,
  };
}

/** The wind signals in a bulletin, read without AI. */
export async function parseBulletin(text) {
  const { parseBulletin: localParse } = await import("./parser.js");
  return decide("bulletins/parse", { text }, () => localParse(text), parseAnswer);
}
