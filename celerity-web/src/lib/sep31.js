// ============================================================================
// SEP-31 DIRECT PAYMENT — PROTOCOL-FAITHFUL MOCK · PDAX UAT TARGET
// ============================================================================
// Stellar settlement asset → farmer PHP (GCash / bank / cash pick-up).
// In production: licensed VASP SEP-31 / CaaS. Here: create + poll status
// machine shaped like SEP-31. Never claim "InstaPay succeeded" as live.

export const SEP31_LABEL = "PROTOCOL-FAITHFUL MOCK · PDAX UAT TARGET · SEP-31";

export const SEP31_STATUS = {
  pending_sender: "pending_sender",
  pending_receiver: "pending_receiver",
  pending_external: "pending_external",
  completed: "completed",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock POST /transactions — creates a SEP-31-shaped disbursement.
 *
 * @param {{ amountPhp: number, dest: string, receiver: { name?: string, detail?: string }, onStatus?: (s: string) => void }} opts
 */
export async function createSep31Transaction({ amountPhp, dest, receiver = {}, onStatus }) {
  const id = `sep31-demo-${Date.now().toString(36)}`;
  onStatus?.(SEP31_STATUS.pending_sender);

  return {
    id,
    status: SEP31_STATUS.pending_sender,
    amountPhp: Number(amountPhp),
    dest,
    receiver,
    // Illustrative — not a live PDAX endpoint.
    pollUrl: `https://uat.pdax.ph/sep31/transactions/${id}`,
  };
}

/**
 * Mock status poll: pending_sender → pending_receiver → pending_external → completed.
 * Call after createSep31Transaction; drives the cash-out loading UI.
 */
export async function pollSep31Status(tx, onStatus) {
  const steps = [
    { status: SEP31_STATUS.pending_sender, wait: 350 },
    { status: SEP31_STATUS.pending_receiver, wait: 450 },
    { status: SEP31_STATUS.pending_external, wait: 550 },
    { status: SEP31_STATUS.completed, wait: 0 },
  ];

  let last = tx;
  for (const step of steps) {
    last = { ...last, status: step.status };
    onStatus?.(step.status);
    if (step.wait) await sleep(step.wait);
  }
  return last;
}

export function sep31Chip(status) {
  switch (status) {
    case SEP31_STATUS.pending_sender:
      return "pending sender";
    case SEP31_STATUS.pending_receiver:
      return "pending receiver";
    case SEP31_STATUS.pending_external:
      return "pending external";
    case SEP31_STATUS.completed:
      return "completed";
    default:
      return status || "—";
  }
}
