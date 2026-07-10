// PH region display names — UI-only. The contract stores regions as bare u32
// and never sees these strings; keep that boundary (design rule: the chain
// compares numbers, the app translates them for humans).
//
// The 13 numbered regions use their own number. The named regions (NCR, CAR,
// BARMM, MIMAROPA, NIR) have no official Roman numeral, so they get synthetic
// codes that don't collide with 1–13: NCR/CAR/NIR/BARMM at 14/15/18/19, and
// MIMAROPA at 40 (it is historically "Region IV-B", the partner to IV-A).
// These codes are an app convention only — pick any free u32 when seeding.
export const REGION_NAMES = {
  1: "Region I — Ilocos",
  2: "Region II — Cagayan Valley",
  3: "Region III — Central Luzon",
  4: "Region IV-A — CALABARZON",
  40: "MIMAROPA Region",
  5: "Region V — Bicol",
  6: "Region VI — Western Visayas",
  7: "Region VII — Central Visayas",
  8: "Region VIII — Eastern Visayas",
  9: "Region IX — Zamboanga Peninsula",
  10: "Region X — Northern Mindanao",
  11: "Region XI — Davao",
  12: "Region XII — SOCCSKSARGEN",
  13: "Region XIII — Caraga",
  14: "NCR — National Capital Region",
  15: "CAR — Cordillera Administrative Region",
  18: "NIR — Negros Island Region",
  19: "BARMM — Bangsamoro (Muslim Mindanao)",
};

// Order the dropdown the way the list is published: the numbered regions in
// sequence (with MIMAROPA between IV-A and V), then the named regions.
const REGION_ORDER = [1, 2, 3, 4, 40, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19];

export const regionName = (r) => REGION_NAMES[Number(r)] ?? `Region ${r}`;

/** Short human name for a region:
 *  "Region V — Bicol" → "Bicol"; "NCR — National Capital Region" → "NCR";
 *  "MIMAROPA Region" (no dash) → "MIMAROPA Region". */
export const regionShort = (r) => {
  const full = regionName(r);
  if (full.includes(" — ")) {
    const [head, tail] = full.split(" — ");
    // For named regions the abbreviation (before the dash) is the short name;
    // for numbered regions the place name (after the dash) is.
    return /^Region /.test(head) ? tail : head;
  }
  return full;
};

export const ISLANDS = {
  Luzon: [1, 2, 3, 4, 40, 5, 14, 15],
  Visayas: [6, 7, 8, 18],
  Mindanao: [9, 10, 11, 12, 13, 19],
};

export const islandOf = (r) =>
  Object.entries(ISLANDS).find(([, keys]) => keys.includes(Number(r)))?.[0] ?? "Other regions";

/** Options for <Select> — every region, in published order. */
export const REGION_OPTIONS = REGION_ORDER.map((value) => ({
  value,
  label: REGION_NAMES[value],
}));
