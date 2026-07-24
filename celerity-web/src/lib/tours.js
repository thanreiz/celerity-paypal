// First-run coach tours — Celerity-native copy for judges + operators.
// Progress persists in localStorage so stage resets are intentional.

const KEYS = {
  farmer: "celerity.tour.farmer.v1",
  funder: "celerity.tour.funder.v1",
};

function readDone(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDone(key, done) {
  try {
    if (done) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private browsing */
  }
}

export function isTourDone(kind) {
  return readDone(KEYS[kind] || kind);
}

export function completeTour(kind) {
  writeDone(KEYS[kind] || kind, true);
}

export function resetTour(kind) {
  writeDone(KEYS[kind] || kind, false);
}

/** Farmer Home coach — anchors via data-tour on Home / BottomNav. */
export const FARMER_TOUR = [
  {
    id: "balance",
    title: "Your relief balance",
    body: "Pesos credited on-chain when a signed typhoon settles your region — already yours even if the phone was offline.",
    anchor: "balance",
  },
  {
    id: "claim",
    title: "Claim installments",
    body: "Recurring pools unlock here after settle. Tap Claim when a card appears — the contract enforces the cooldown.",
    anchor: "claim",
  },
  {
    id: "cashout",
    title: "Cash out to pesos",
    body: "Move spendable balance to GCash, bank, or a nearby pick-up when you are ready.",
    anchor: "cashout",
    chip: "SEP-31 · demo · PDAX UAT target",
  },
  {
    id: "activity",
    title: "Activity history",
    body: "Every on-chain receipt and demo cash-out in one place — tap a row for detail.",
    anchor: "activity",
  },
];

/** Funder Home coach — escrow isolation + demo loop. */
export const FUNDER_TOUR = [
  {
    id: "escrow",
    title: "Still escrowed",
    body: "Only this institution’s sub-pools. The other funder’s money never appears here.",
    anchor: "escrow",
  },
  {
    id: "tutorial",
    title: "Live tutorial",
    body: "Follow the next step in the demo loop — fund, enroll, trigger, then watch releases land.",
    anchor: "tutorial",
  },
  {
    id: "oracle",
    title: "Trigger Typhoon",
    body: "Load a PAGASA-style bulletin, then Sign & settle. The contract verifies Ed25519 — it never reads the file.",
    anchor: "oracle",
  },
  {
    id: "ledger",
    title: "Your ledger",
    body: "Per-funder releases on-chain. Switch ADB ↔ PCIC to show independent pools.",
    anchor: "ledger",
  },
];
