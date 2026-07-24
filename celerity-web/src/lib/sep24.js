// ============================================================================
// SEP-24 INTERACTIVE DEPOSIT — PROTOCOL-FAITHFUL MOCK · PDAX UAT TARGET
// ============================================================================
// Funder fiat → Stellar settlement asset. In production this is a licensed
// VASP (PDAX UAT → prod) interactive deposit. Here we simulate the SEP-24
// status machine, then the app calls the real on-chain `deposit` / `top_up`.
// Never claim a live Instant Pay / InstaPay completed.

export const SEP24_LABEL = "PROTOCOL-FAITHFUL MOCK · PDAX UAT TARGET · SEP-24";

/** SEP-24 transaction statuses we surface in the UI (subset). */
export const SEP24_STATUS = {
  incomplete: "incomplete",
  pending_user: "pending_user_transfer_start",
  pending_anchor: "pending_anchor",
  completed: "completed",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock interactive deposit. Advances through SEP-24-shaped statuses, then
 * resolves so the caller can invoke the real Soroban deposit/top_up.
 *
 * @param {{ amount: number, fiatCurrency: "USD"|"PHP", onStatus?: (s: string) => void }} opts
 * @returns {Promise<{ id: string, interactiveUrl: string, status: string, amount: number, fiatCurrency: string }>}
 */
export async function mockInteractiveDeposit({ amount, fiatCurrency = "USD", onStatus }) {
  const id = `sep24-demo-${Date.now().toString(36)}`;
  const interactiveUrl = `https://uat.pdax.ph/sep24/interactive/deposit?tx=${id}`; // illustrative only

  const steps = [
    { status: SEP24_STATUS.incomplete, wait: 280 },
    { status: SEP24_STATUS.pending_user, wait: 420 },
    { status: SEP24_STATUS.pending_anchor, wait: 520 },
    { status: SEP24_STATUS.completed, wait: 0 },
  ];

  for (const step of steps) {
    onStatus?.(step.status);
    if (step.wait) await sleep(step.wait);
  }

  return {
    id,
    interactiveUrl,
    status: SEP24_STATUS.completed,
    amount: Number(amount),
    fiatCurrency,
  };
}

/** Short chip label for a SEP-24 status string. */
export function sep24Chip(status) {
  switch (status) {
    case SEP24_STATUS.incomplete:
      return "incomplete";
    case SEP24_STATUS.pending_user:
      return "pending user";
    case SEP24_STATUS.pending_anchor:
      return "pending anchor";
    case SEP24_STATUS.completed:
      return "completed";
    default:
      return status || "—";
  }
}
