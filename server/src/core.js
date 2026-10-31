// Client for the Java core (core/), which holds the same deterministic money
// rules as policy.js and funding.js. CORE_MODE decides who answers:
//   off     only the rules in this process (default)
//   shadow  this process decides; the core is asked too and any difference is
//           logged, so the two can be compared on real traffic
//   on      the core decides; if it can't be reached, this process does
// Only what the rules read is sent: no names, and the PayPal email becomes a
// yes/no flag.

import { createHash } from "node:crypto";
import { POLICY, checkDraft as localCheckDraft } from "./policy.js";
import { allocateRun as localAllocateRun } from "./funding.js";

const TIMEOUT_MS = 3000;

const mode = () => {
  const m = (process.env.CORE_MODE || "off").toLowerCase();
  return process.env.CORE_URL && (m === "shadow" || m === "on") ? m : "off";
};

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
    pools: (state.pools || []).map((p) => ({ id: p.id, provinces: p.provinces })),
    contributions: (state.contributions || []).map((c) => ({ pool_id: c.pool_id, amount: c.amount, status: c.status })),
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

/** Policy violations for one draft (empty = OK). */
export function checkDraft(state, run, draft) {
  return decide(
    "policy/check-draft",
    { state: coreState(state), run: { storm: run.storm, areas: run.areas, drafts: run.drafts }, draft },
    () => localCheckDraft(state, run, draft),
    (r) => r.errors
  );
}

/** The split of each draft across the funders' pools. */
export function allocateRun(state, run) {
  return decide(
    "funding/allocate",
    { state: coreState(state), run: { drafts: run.drafts } },
    () => localAllocateRun(state, run),
    (r) => r
  );
}
