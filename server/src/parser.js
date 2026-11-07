// Reads the wind signals out of a PAGASA tropical cyclone bulletin without an
// AI model: a line-for-line port of the Java core's BulletinParser, so the
// rules path works even when the core is asleep. Routine bulletins are
// regular: "TCWS No. N" headings followed by "Luzon: / Visayas: / Mindanao:"
// lists of provinces, sometimes narrowed to "the eastern portion of X (A, B)".
// Anything it can't place goes to `unparsed` and lowers `confidence`; that is
// the hand-off to the AI agent. Text outside the signal blocks is never read
// as data, so instructions smuggled into a bulletin have nothing to act on.

import { PROVINCES_TXT } from "./provinces.js";

/** lower-case alias -> official name */
const PROVINCES = (() => {
  const map = new Map();
  for (const raw of PROVINCES_TXT.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const names = line.split("|");
    for (const n of names) map.set(n.trim().toLowerCase(), names[0].trim());
  }
  return map;
})();

/** Every official province name, for validating funders' pool rules. */
export const PROVINCE_NAMES = [...new Set(PROVINCES.values())];

/** The official name for a province as written, or null. */
export function lookupProvince(name) {
  const key = String(name ?? "")
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/\s+province$/i, "")
    .toLowerCase();
  return PROVINCES.get(key) ?? null;
}

const STORM = /^\s*(Super Typhoon|Typhoon|Severe Tropical Storm|Tropical Storm|Tropical Depression)\s+["“]?([A-Za-z][A-Za-z-]+)["”]?/im;
const NUMBER = /BULLETIN\s+(?:NR|NO)\.?\s*(\d+)/i;
const SIGNAL = /^\s*TCWS\s+No\.?\s*(\d)\b(.*)$/i;
const IN_EFFECT = /in effect\s*:\s*(.+)$/i;
const REGION = /^\s*(Luzon|Visayas|Mindanao)\s*:\s*(.*)$/i;
const PORTION = /^(?:the\s+)?(?:[a-z-]+(?:\s+and\s+[a-z-]+)?\s+)?portions?\s+of\s+(.+?)\s*(?:\((.+)\))?$/i;
const PARENS = /^(.+?)\s*\((.+)\)$/;
const INCLUDING = /^(.+?)\s+including\s+.+$/i;
const LINE_BREAK = /\r\n|[\n\r\v\f\x85\u2028\u2029]/;

function titleCase(s) {
  return s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Split on commas and "and" that are not inside parentheses. */
export function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  // "Albay and Sorsogon" -> two items, unless "and" is part of a phrase like
  // "Ticao and Burias Islands".
  const split = [];
  for (const part of out) {
    const p = part.trim().replace(/^and\s+/i, "");
    if (p.toLowerCase().includes(" including ") || p.includes("(")) split.push(p);
    else split.push(...p.split(/\s+and\s+/i));
  }
  return split;
}

function readList(list, signal, areas, unparsed) {
  for (const raw of splitTopLevel(list)) {
    const item = raw.trim().replace(/[.;]+$/, "").trim();
    if (!item) continue;
    let province;
    let municipalities = [];
    const portion = item.match(PORTION);
    const parens = item.match(PARENS);
    const including = item.match(INCLUDING);
    if (portion) {
      province = lookupProvince(portion[1]);
      if (portion[2] != null) municipalities = splitTopLevel(portion[2]);
    } else if (parens) {
      province = lookupProvince(parens[1]);
      municipalities = splitTopLevel(parens[2]);
    } else if (including) {
      province = lookupProvince(including[1]); // "Masbate including Ticao and Burias Islands"
    } else {
      province = lookupProvince(item);
    }
    if (!province) {
      unparsed.push(item);
      continue;
    }
    if (!municipalities.length) {
      areas.push({ province, municipality: null, signal_level: signal });
    } else {
      for (const m of municipalities) {
        const name = m.trim();
        if (name) areas.push({ province, municipality: name, signal_level: signal });
      }
    }
  }
}

/** { storm, bulletin_number, areas[], unparsed[], confidence } */
export function parseBulletin(text) {
  const body = typeof text === "string" ? text : "";
  const sm = body.match(STORM);
  const storm = sm ? `${titleCase(sm[1])} ${titleCase(sm[2])}` : null;
  const nm = body.match(NUMBER);
  const bulletin_number = nm ? String(Number.parseInt(nm[1], 10)) : null;

  const areas = [];
  const unparsed = [];
  let signal = 0;
  let sawSignal = false;
  for (const line of body.split(LINE_BREAK)) {
    const s = line.match(SIGNAL);
    if (s) {
      sawSignal = true;
      signal = Number(s[1]);
      const inline = s[2].match(IN_EFFECT);
      if (inline) readList(inline[1], signal, areas, unparsed);
      continue;
    }
    const r = line.match(REGION);
    if (r && signal > 0) {
      readList(r[2], signal, areas, unparsed);
      continue;
    }
    if (!line.trim()) signal = 0; // a blank line ends a signal block
  }
  const places = new Set(areas.map((a) => a.province)).size;
  let confidence;
  if (!sawSignal) confidence = 0;
  else if (!areas.length && !unparsed.length) confidence = 1;
  else confidence = places / (places + unparsed.length);
  return { storm, bulletin_number, areas, unparsed, confidence: Math.round(confidence * 100) / 100 };
}

/** A bulletin the rules can act on alone: a storm name, at least one area,
 * and nothing left over for an AI to interpret. */
export const routine = (parsed) => Boolean(parsed.storm) && parsed.areas.length > 0 && parsed.unparsed.length === 0 && parsed.confidence === 1;

/** The wind signal of the TCWS block a list item sits in (0 if none): the
 * same walk as parseBulletin, used to give a phrase placed later (by Jev)
 * the signal its line carried. */
export function signalOfPhrase(text, phrase) {
  let signal = 0;
  for (const line of String(text || "").split(LINE_BREAK)) {
    const s = line.match(SIGNAL);
    if (s) {
      signal = Number(s[1]);
      const inline = s[2].match(IN_EFFECT);
      if (inline && splitTopLevel(inline[1]).some((x) => x.trim().replace(/[.;]+$/, "").trim() === phrase)) return signal;
      continue;
    }
    const r = line.match(REGION);
    if (r && signal > 0) {
      if (splitTopLevel(r[2]).some((x) => x.trim().replace(/[.;]+$/, "").trim() === phrase)) return signal;
      continue;
    }
    if (!line.trim()) signal = 0;
  }
  return 0;
}
