// ============================================================================
// SEP-31 ANCHOR — DEMO STUB. THIS IS NOT A REAL ANCHOR INTEGRATION.
// ============================================================================
// In production this leg is a licensed Stellar anchor (a Coins.ph-class VASP)
// receiving the on-chain asset over SEP-31 and paying out PHP to the farmer's
// wallet or cash-out point. That requires a compliance partnership, not code,
// so the hackathon build mocks it — visibly and honestly.
//
// Everything before this point (escrow, trigger, release, ledger) is real and
// live on Testnet. Only this currency conversion is simulated.

export const ANCHOR_LABEL = "SEP-31 anchor stub — demo conversion, not a real cash-out";

// Demo rate: 1 unit (testnet XLM standing in for a USD stablecoin) → PHP.
export const DEMO_PHP_RATE = 57.5;

export function toPHPNumber(units) {
  return Number(units) * DEMO_PHP_RATE;
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
