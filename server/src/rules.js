// The rules path: a routine bulletin decided with no AI at all. The parser
// reads the wind signals, policy picks every eligible family and its cap,
// the pools must cover it. Because nothing here is a judgment call, the run
// is released without waiting for a person (AUTO_RELEASE, on by default).
// Anything the parser can't place goes to Jev or the agent instead, and a
// person approves any run an AI had a hand in.
//
// Same input, same drafts, every time.

import { POLICY, VULNERABILITY_FLAGS, checkDraft, eligibility, runTotals } from "./policy.js";
import { PROVINCE_NAMES, parseBulletin, routine, signalOfPhrase } from "./parser.js";
import { JEV_THRESHOLDS, assessBulletin, jevConfigured } from "./jev.js";
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

/**
 * Decide how a bulletin is handled, from the parser and (when configured)
 * Jev. Returns { route, parsed, jev, hold }:
 *   route "rules"  the parser read everything
 *   route "jev"    the parser + Jev's confident whole-province placements
 *                  cover everything; parsed.areas includes them. The rules
 *                  draft it, and a coordinator approves, because an AI
 *                  judgment decided where the money goes
 *   route "agent"  something needs judgment: the GPT agent drafts and a
 *                  coordinator approves
 * hold is a reason a rules/jev run must still wait for a coordinator (Jev
 * thinks the bulletin carries injected instructions), or null.
 */
export async function routeBulletin(text, { forceAgent = false, fetchImpl } = {}) {
  const parsed = await readBulletin(text);
  const jev = jevConfigured() && !forceAgent ? await assessBulletin({ text, parsed, provinceNames: PROVINCE_NAMES, fetchImpl }) : null;
  let hold = null;
  if (jev && jev.injection >= JEV_THRESHOLDS.injection) hold = `Jev puts the chance of instructions hidden in this bulletin at ${Math.round(jev.injection * 100)}%`;
  // Jev is switched on but gave no usable answer: nobody checked this
  // bulletin for hidden instructions, so a person looks before money moves.
  else if (!jev && jevConfigured() && !forceAgent) hold = "Jev could not check this bulletin for hidden instructions";
  if (forceAgent) return { route: "agent", parsed, jev, hold };
  if (routine(parsed)) return { route: "rules", parsed, jev, hold };

  // Every leftover phrase must have been asked about and accepted; Jev is
  // only asked about the first 20.
  const placeable = parsed.storm && jev?.placements?.length === parsed.unparsed.length && jev.placements.every((p) => p.accepted);
  if (placeable) {
    const extra = [];
    for (const pl of jev.placements) {
      const signal = signalOfPhrase(text, pl.phrase);
      if (!signal) return { route: "agent", parsed, jev, hold };
      extra.push({ province: pl.province, municipality: null, signal_level: signal });
    }
    return { route: "jev", parsed: { ...parsed, areas: [...parsed.areas, ...extra] }, jev, hold };
  }
  return { route: "agent", parsed, jev, hold };
}
