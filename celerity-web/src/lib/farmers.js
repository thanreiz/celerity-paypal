// Demo farmer identities. The contract only stores addresses; the app maps
// known seed faces so the ledger and View-as switch read "Mang Ramon /
// Aling Nena" instead of truncated keys during the money-shot.
import { addr } from "./celerity";
import { short } from "./config";

/** Presenter-facing farmers you can open the wallet as. */
export const DEMO_FARMERS = [
  {
    role: "farmer",
    name: "Mang Ramon",
    shortName: "Ramon",
    region: 5,
  },
  {
    role: "farmer2",
    name: "Aling Nena",
    shortName: "Nena",
    region: 5,
  },
];

/** Extra registry-only payees from seed-demo (no View-as key). */
export const EXTRA_FARMERS = {
  GB77JCESFNHQJF54KOSPFGVLBWTKFVT4ABYL2SRJNFCW6HVCA7GLYYSL: {
    name: "Ka Danilo",
    region: 10,
  },
  GDBNIDHTUKJBJIGSDGDPOYAZOD4C2ZVGLR4A2X5GOLRVI5FNCGOREF4O: {
    name: "Aling Rosa",
    region: 8,
  },
};

export const demoFarmerByRole = (role) => DEMO_FARMERS.find((f) => f.role === role);

/** Avatar initials from a display name — "Aling Nena" → AN, not AL. */
export function farmerInitials(name) {
  if (!name) return "?";
  const parts = String(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Human label for a farmer address — known demo faces first, else short addr. */
export function farmerLabel(farmerAddr) {
  if (!farmerAddr) return "—";
  try {
    for (const f of DEMO_FARMERS) {
      if (farmerAddr === addr(f.role)) return f.name;
    }
  } catch {
    /* env not loaded in non-app contexts */
  }
  return EXTRA_FARMERS[farmerAddr]?.name ?? short(farmerAddr);
}
