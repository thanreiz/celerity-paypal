// Seed the Celerity demo "money-shot" onto a FRESH contract.
//
// Run AFTER a redeploy, from the celerity-web dir so it reuses that package's
// @stellar/stellar-sdk (v16) and reads the demo secrets from celerity-web/.env:
//
//   cd celerity-web && node ../tools/seed-demo.mjs
//
// It calls the contract with the SDK exactly as the frontend does. It leaves
// every pool ARMED and the ledger EMPTY — it never fires report_event /
// settle_event, so the operator triggers the typhoon live on stage.
//
// Registry: farmer1 is a real funded keypair (the Farmer App logs in as it and
// receives payouts). The other three farmers are extra generated ADDRESSES —
// registered payees only need to receive, not sign, so no funding is required.
//
// Idempotent enough for a fresh contract: re-running would create duplicate
// pools (ids keep climbing) and would re-register farmers (which errors). Run
// once per redeploy.

import { readFileSync } from "node:fs";
import { Keypair, contract } from "@stellar/stellar-sdk";

// Load celerity-web/.env by hand (no dotenv dep in celerity-web — Vite injects
// env itself). Run from celerity-web/, so .env is in the cwd.
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const need = (k) => {
  const v = env[k];
  if (!v) throw new Error(`Missing ${k} in celerity-web/.env`);
  return v;
};

const CONTRACT_ID = need("VITE_CONTRACT_ID");
const NETWORK_PASSPHRASE = need("VITE_NETWORK_PASSPHRASE");
const RPC_URL = need("VITE_RPC_URL");

const kp = {
  alice: Keypair.fromSecret(need("VITE_FUNDER_SECRET")), // funder + registry admin
  mallory: Keypair.fromSecret(need("VITE_FUNDER2_SECRET")), // second funder (PCIC)
  farmer1: Keypair.fromSecret(need("VITE_FARMER_SECRET")),
};

// 1 XLM = 10^7 stroops
const UNIT = 10_000_000n;
const xlm = (n) => BigInt(Math.round(n * Number(UNIT)));

const clients = {};
async function clientFor(role) {
  if (!clients[role]) {
    const k = kp[role];
    clients[role] = await contract.Client.from({
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: k.publicKey(),
      ...contract.basicNodeSigner(k, NETWORK_PASSPHRASE),
    });
  }
  return clients[role];
}

async function invoke(role, method, args) {
  const c = await clientFor(role);
  const tx = await c[method](args);
  const { result } = await tx.signAndSend();
  return result;
}

// Extra registry-only payees (fixed addresses; no keys needed to receive).
// Hardcoded so re-deploys keep the same faces the mockups established.
const EXTRA_FARMERS = [
  { name: "Aling Nena", region: 5, addr: "GDIC6CFR5XLCZ37LSHSLE3MZYSMKTVXUBUYVQISBVJFLWM4X7UGPCAF4" },
  { name: "Ka Danilo", region: 10, addr: "GB77JCESFNHQJF54KOSPFGVLBWTKFVT4ABYL2SRJNFCW6HVCA7GLYYSL" },
  { name: "Aling Rosa", region: 8, addr: "GDBNIDHTUKJBJIGSDGDPOYAZOD4C2ZVGLR4A2X5GOLRVI5FNCGOREF4O" },
];

async function main() {
  console.log(`Seeding fresh contract ${CONTRACT_ID}\n`);

  // --- Registry (admin = alice) -------------------------------------------
  const farmers = [
    { name: "Mang Ramon (farmer1)", region: 5, addr: kp.farmer1.publicKey() },
    ...EXTRA_FARMERS,
  ];
  for (const f of farmers) {
    await invoke("alice", "register_farmer", { addr: f.addr, region: f.region });
    console.log(`  ✓ registered ${f.name} — region ${f.region} — ${f.addr.slice(0, 4)}…${f.addr.slice(-4)}`);
  }

  // --- Pools: small real XLM; frontend renders them as pesos --------------
  // ADB APDRF (alice): Bicol + N. Mindanao. PCIC (mallory): Bicol + E. Visayas.
  const pools = [
    { role: "alice", name: "ADB · Bicol Typhoon Relief", region: 5, threshold: 3, amount: 5, payout: 1, installments: 3, period: 60 },
    { role: "alice", name: "ADB · N. Mindanao Flood Relief", region: 10, threshold: 3, amount: 4, payout: 1, installments: 1, period: 0 },
    { role: "mallory", name: "PCIC · Bicol Crop-Loss Indemnity", region: 5, threshold: 3, amount: 4, payout: 1, installments: 1, period: 0 },
    { role: "mallory", name: "PCIC · E. Visayas Rice Cover", region: 8, threshold: 3, amount: 3, payout: 1, installments: 1, period: 0, pause: true },
  ];

  const created = [];
  for (const p of pools) {
    const id = await invoke(p.role, "deposit", {
      funder: kp[p.role].publicKey(),
      amount: xlm(p.amount),
      region: p.region,
      threshold: p.threshold,
      payout: xlm(p.payout),
      installments: p.installments,
      claim_period_secs: BigInt(p.period),
    });
    created.push({ ...p, id });
    console.log(`  ✓ pool #${id} — ${p.name} — ${p.amount} XLM escrow, payout ${p.payout} XLM${p.installments > 1 ? ` ×${p.installments}` : ""}`);
  }

  // Pause the PCIC Rice Cover so the "1 paused" story shows on the dashboard.
  for (const p of created) {
    if (p.pause) {
      await invoke(p.role, "pause_pool", { pool_id: p.id });
      console.log(`  ✓ paused pool #${p.id} — ${p.name}`);
    }
  }

  console.log(`\nDone. ${created.length} pools armed, ${farmers.length} farmers registered, ledger empty.`);
  console.log("No typhoon fired — trigger it live from the Trigger Typhoon screen.");
  console.log("\nPool names live in the browser (localStorage); the app shows region-derived");
  console.log("fallback names until you rename them in Create-Pool. Generated farmer addresses:");
  for (const f of EXTRA_FARMERS) console.log(`  ${f.name} (region ${f.region}): ${f.addr}`);
}

main().catch((e) => {
  console.error("\nSeed failed:", e.message || e);
  process.exit(1);
});
