// First-run coach tours — plain language for farmers and funders.
// Progress persists in localStorage so stage resets are intentional.
// Bump key versions when steps change so returning users see the new tour.

const KEYS = {
  farmer: "celerity.tour.farmer.v2",
  funder: "celerity.tour.funder.v2",
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

/** Farmer Home coach — short steps, everyday words, clear “what to tap”. */
export const FARMER_TOUR = [
  {
    id: "balance",
    title: "This is your money",
    body: "When a big storm hits your area and relief is released, the amount shows here in pesos. It is already yours — even if your phone was off.",
    anchor: "balance",
  },
  {
    id: "cashout",
    title: "Cash out when you need it",
    body: "Tap Cash out to send pesos to GCash, a bank account, or a nearby pick-up. Practice anytime — this demo does not move real money.",
    anchor: "cashout",
    chip: "Practice only",
  },
  {
    id: "history",
    title: "See past payments",
    body: "Tap History to open a list of money that came in and money you sent out. Useful if you need to show a receipt.",
    anchor: "history",
  },
  {
    id: "claim",
    title: "Claim the next payment",
    body: "Some relief comes in parts. When a green Claim card appears here, tap it to get the next part. If nothing shows yet, wait until after a storm is settled.",
    anchor: "claim",
  },
  {
    id: "shortcuts",
    title: "Quick help buttons",
    body: "Use these for Relief Programs, Installments, My Region, and Help. Tap any one to learn more in plain words.",
    anchor: "shortcuts",
  },
  {
    id: "recent",
    title: "What just happened",
    body: "New money and cash-outs show up in Recent activity. Tap a row later to open the details.",
    anchor: "recent",
  },
  {
    id: "activity",
    title: "Activity tab",
    body: "At the bottom, tap Activity anytime for the full list of payments — not just the latest ones.",
    anchor: "activity",
  },
  {
    id: "profile",
    title: "Your profile",
    body: "Tap Profile to see your name, region, and support contacts. You can also Replay this tour from there if you get stuck.",
    anchor: "profile",
  },
];

/** Funder Home coach — operator walkthrough without crypto jargon. */
export const FUNDER_TOUR = [
  {
    id: "escrow",
    title: "Money waiting safely",
    body: "This big number is only your institution’s relief funds. The other funder’s money never mixes in or shows here.",
    anchor: "escrow",
  },
  {
    id: "pools",
    title: "Your relief pools",
    body: "Tap My Pools to open each pot of money and its rule — for example, which region and how strong a storm must be before payout.",
    anchor: "pools",
  },
  {
    id: "farmers",
    title: "Who can receive",
    body: "Tap Farmers (LGU) to see the government list of enrolled farmers. Funders look; the LGU decides who is on the list.",
    anchor: "farmers",
  },
  {
    id: "tutorial",
    title: "Follow the checklist",
    body: "This panel shows the next demo step: fund a pool, enroll farmers, trigger a typhoon, then watch money land. Tap the action button when you are ready.",
    anchor: "tutorial",
  },
  {
    id: "oracle",
    title: "Trigger the typhoon",
    body: "Tap Trigger Typhoon, load a sample weather bulletin, then Sign & settle. The system checks a digital signature and the numbers — it does not read the story in the file.",
    anchor: "oracle",
  },
  {
    id: "ledger",
    title: "Proof money was sent",
    body: "Tap Ledger to see every payout from your pools to farmers. Switch ADB ↔ PCIC at the top of Pools to prove each funder only sees their own releases.",
    anchor: "ledger",
  },
  {
    id: "settings",
    title: "Settings & replay",
    body: "Tap Settings for demo preferences and technical details. To see these tips again, use Replay coach tips on the Home checklist.",
    anchor: "settings",
  },
];
