// Contract error codes (contracts/celerity/src/lib.rs Error enum) → messages
// a judge can read from the back row. Raw simulation dumps never reach a toast.
const CONTRACT_ERRORS = {
  2: "Contract not initialized",
  3: "Pool not found",
  4: "Farmer not registered",
  5: "Farmer is already registered",
  6: "Amount must be positive",
  7: "Payout must be positive",
  8: "Installments must be at least 1",
  9: "Pool isn't paused — nothing to resume",
  10: "Replay rejected — this signed event was already submitted",
  11: "Event not found",
  12: "Recurring pools need a claim period",
  13: "Pool is paused by its funder",
  14: "Pool can't cover the payout — the funder needs to top it up",
  15: "No claim schedule here yet — a typhoon settlement starts one",
  16: "All installments already paid out",
  17: "Not due yet — the next installment unlocks after the claim period",
};

export function friendlyError(e) {
  const raw = String((e && (e.message || e)) || "unknown error");
  const code = raw.match(/Error\(Contract, #(\d+)\)/);
  if (code && CONTRACT_ERRORS[Number(code[1])]) return CONTRACT_ERRORS[Number(code[1])];
  if (/Error\(Crypto/.test(raw)) return "Signature rejected — not signed by the authorized oracle key";
  if (raw.includes("Bad union switch")) return "SDK/protocol mismatch — upgrade @stellar/stellar-sdk";
  // Fall back to the first line, trimmed to something readable on stage.
  return raw.split("\n")[0].slice(0, 160);
}
