// The rules path: a routine bulletin decided with no AI at all. The parser
// reads the wind signals, policy picks every eligible family and its cap,
// the pools must cover it. Because nothing here is a judgment call, the run
// is released without waiting for a person (AUTO_RELEASE, on by default).
// Anything the parser can't place goes to the agent instead, and a person
// approves what the agent drafts.
//
// Same input, same drafts, every time.

import { POLICY, VULNERABILITY_FLAGS, checkDraft, eligibility, runTotals } from "./policy.js";
import { parseBulletin, routine } from "./parser.js";
import * as core from "./core.js";

export const autoRelease = () => process.env.AUTO_RELEASE !== "0";

/** Parse a bulletin with the Java core when it is on (its parser is the
 * original), else with the Node port. Never fails: a core error falls back. */
export async function readBulletin(text) {
  if (core.active()) {
    try {
      const r = await core.parseBulletin(text);
      if (r) return { ...r, parsed_by: "java-core" };
    } catch (e) {
      console.warn(`core parse failed, using the Node parser: ${e.message}`);
    }
  }
  return { ...parseBulletin(text), parsed_by: "node" };
}

export { routine };

/**
 * Fill `run` with drafts for every eligible family, decided by policy alone:
 * highest signal first, then most vulnerable, then registration order. A
 * family the caps or pools can't fit is skipped with the reason.
 */
export function draftByRules(state, run, parsed) {
  run.storm = parsed.storm;
  run.bulletin_number = parsed.bulletin_number;
  run.areas = parsed.areas;
  run.drafts = [];
  const skipped = [];

  const candidates = state.families
    .map((f, i) => ({ f, i, el: eligibility(state, f, run) }))
    .filter((c) => c.el.signal > 0);
  const flags = (f) => VULNERABILITY_FLAGS.filter((k) => f.vulnerability?.[k]).length;
  candidates.sort((a, b) => b.el.signal - a.el.signal || flags(b.f) - flags(a.f) || a.i - b.i);

  for (const { f, el } of candidates) {
    if (!el.eligible) {
      skipped.push({ family_id: f.id, reasons: el.reasons });
      continue;
    }
    const draft = { family_id: f.id, amount: el.max_amount, rationale: `Signal ${el.signal} in ${f.municipality}, ${f.province}: full policy amount.` };
    const errors = checkDraft(state, run, draft);
    if (errors.length) {
      skipped.push({ family_id: f.id, reasons: errors });
      continue;
    }
    run.drafts.push({ ...draft, currency: POLICY.currency, signal: el.signal, max_amount: el.max_amount });
  }
  run.skipped = skipped;
  const t = runTotals(run);
  run.summary = `${run.storm}: the rules read ${new Set(run.areas.map((a) => a.province)).size} province(s) under a wind signal and drafted ${t.recipients} payout(s), ${t.amount} ${POLICY.currency} in all.${skipped.length ? ` ${skipped.length} family(ies) skipped.` : ""}`;
  return run;
}
