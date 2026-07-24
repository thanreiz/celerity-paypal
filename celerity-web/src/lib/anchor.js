// ============================================================================
// FX + display helpers for the demo settlement unit → PHP.
// ============================================================================
// On Testnet the escrow asset is XLM standing in for a USD stablecoin
// (1 unit ≈ $1). Farmers and PCIC think in pesos; ADB thinks in dollars.
// DEMO_USDPHP is the fixed demo FX — not an "XLM price."
//
// The live cash-out path is the SEP-31 mock in sep31.js (PDAX UAT target).
// Everything before that (escrow, trigger, release, ledger) is real Testnet.

/** Fixed demo FX: 1 settlement unit (≈ $1 USDC stand-in) → PHP. */
export const DEMO_USDPHP = 57.5;

/** @deprecated Use DEMO_USDPHP — kept so older imports don't break mid-demo. */
export const DEMO_PHP_RATE = DEMO_USDPHP;

export const ANCHOR_LABEL =
  "SEP-31 protocol mock · PDAX UAT target — demo conversion, not a live cash-out";

export function toPHPNumber(units) {
  return Number(units) * DEMO_USDPHP;
}

export function toPHP(units) {
  return toPHPNumber(units).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
}

/** Same as toPHP but without the currency symbol/formatting noise —
 * for contexts (e.g. "Claim ₱5,000") that already render the ₱ sign. */
export function phpValue(units) {
  return `₱${Math.round(toPHPNumber(units)).toLocaleString()}`;
}

/** Settlement units from a USD amount (ADB path). 1 unit ≈ $1. */
export function unitsFromUsd(usd) {
  const n = Number(usd);
  return Number.isFinite(n) ? n : 0;
}

/** Settlement units from a PHP amount (PCIC path). */
export function unitsFromPhp(php) {
  const n = Number(php);
  return Number.isFinite(n) ? n / DEMO_USDPHP : 0;
}

/** Format a USD amount for funder UI. */
export function usdValue(units) {
  return `$${Number(units).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
