// Thin wrapper around the generated Soroban contract client.
// One client per demo identity; the client is built from the on-chain
// contract spec, so method names/args match lib.rs exactly.
import { Keypair, contract } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL, SECRETS, short } from "./config";

export const keypairs = Object.fromEntries(
  Object.entries(SECRETS).map(([role, secret]) => [role, Keypair.fromSecret(secret)])
);

export const addr = (role) => keypairs[role].publicKey();

// Farmer-facing friendly names for the two demo funders — mirrors the
// FUNDERS list in FunderPortal.jsx, but keyed by address since receipts only
// carry the funder's public key, not their role string.
const FUNDER_LABELS = {
  [addr("funder")]: "ADB Typhoon Relief",
  [addr("funder2")]: "PCIC Crop Support",
};
export const funderLabel = (funderAddr) => FUNDER_LABELS[funderAddr] ?? `Relief program (${short(funderAddr)})`;

// Memoize the PROMISE, not the resolved client: concurrent first calls (App
// refresh + view effects fire together on mount) must share one spec fetch
// instead of each building their own client.
const clientPromises = {};
function clientFor(role) {
  if (!clientPromises[role]) {
    const kp = keypairs[role];
    clientPromises[role] = contract.Client.from({
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: kp.publicKey(),
      ...contract.basicNodeSigner(kp, NETWORK_PASSPHRASE),
    });
  }
  return clientPromises[role];
}

/** Submit a state-changing call as `role`. Returns the tx result value. */
export async function invoke(role, method, args) {
  const c = await clientFor(role);
  const tx = await c[method](args);
  const { result } = await tx.signAndSend();
  return result;
}

/** Read-only call (simulation only, no signature, no fee). */
export async function view(method, args) {
  const c = await clientFor("funder"); // any source account works for reads
  const tx = await c[method](args);
  return tx.result;
}

/** All pools, by scanning ids upward until the first missing pool. */
export async function allPools() {
  const pools = [];
  for (let id = 1n; ; id++) {
    let p;
    try {
      p = await view("pool", { pool_id: id });
    } catch {
      break; // PoolNotFound: end of scan
    }
    // Depending on SDK version a missing pool can also surface as an
    // empty/valueless simulation result rather than a throw.
    if (!p || p.status === undefined) break;
    pools.push({ id, ...p, status: p.status.tag ?? p.status });
  }
  return pools;
}

/** Every release paid to `farmer`, across all funders' ledgers. Demo scale. */
export async function farmerReceipts(farmer) {
  const pools = await allPools();
  const funders = [...new Set(pools.map((p) => p.funder))];
  const receipts = [];
  for (const funder of funders) {
    const ledger = await view("funder_ledger", { funder });
    for (const r of ledger) if (r.farmer === farmer) receipts.push(r);
  }
  return { pools, receipts };
}

/** All registered farmers, grouped by region. Regions are discovered from
 * the pools currently in play (there's no "list all regions" contract call
 * at demo scale) so a region with a pool but zero registered farmers still
 * shows up as an empty group. */
export async function farmersByRegion(pools) {
  const regions = [...new Set(pools.map((p) => p.region))].sort((a, b) => a - b);
  const groups = [];
  for (const region of regions) {
    const addrs = await view("farmers_in_region", { region });
    const list = await Promise.all(
      addrs.map((a) => view("farmer", { addr: a }))
    );
    groups.push({ region, list });
  }
  return groups;
}

/** Enroll a farmer in a region. Admin-auth only — the LGU registrar key
 * signs, never a funder (alice holds both roles in this demo deployment). */
export async function registerFarmer(addr, region) {
  return invoke("admin", "register_farmer", { addr, region: Number(region) });
}

/** Remove a farmer from the registry. Admin-auth only. */
export async function removeFarmer(addr) {
  return invoke("admin", "remove_farmer", { addr });
}

// ---------------------------------------------------------------------------
// Oracle simulator (DEMO): signs the exact payload the contract verifies —
// "CELERITY-EVENT-V1" || region u32 BE || signal u32 BE || nonce u64 BE —
// with the same key oracle/sign-event.js uses. Surfaced in the UI so the
// stage demo is clickable end to end; the Node signer is the "official" path.
// ---------------------------------------------------------------------------
export function signEvent(region, signal, nonce) {
  const payload = Buffer.alloc(33);
  Buffer.from("CELERITY-EVENT-V1", "ascii").copy(payload, 0);
  payload.writeUInt32BE(region, 17);
  payload.writeUInt32BE(signal, 21);
  payload.writeBigUInt64BE(nonce, 25);
  return Buffer.from(keypairs.oracle.sign(payload));
}

export async function reportAndSettle(region, signal, role = "funder", nonce = BigInt(Date.now())) {
  const sig = signEvent(region, signal, nonce);
  // The oracle key signs the PAYLOAD only — any funded account may relay the
  // event and crank settlement (the signature, not the submitter, is the
  // authority), so the current funder identity submits both transactions.
  const eventId = await invoke(role, "report_event", {
    region,
    signal,
    nonce,
    sig,
  });
  // The settle simulation can race the RPC's view of the just-written event
  // (read-after-write lag ~1s on Testnet). One short-delay retry keeps the
  // stage demo from dying on that flake.
  let released;
  try {
    released = await invoke(role, "settle_event", { event_id: eventId });
  } catch {
    // Safe to retry even if the first settle actually landed: settlement is
    // idempotent on-chain, a re-run pays nothing twice.
    await new Promise((r) => setTimeout(r, 2000));
    released = await invoke(role, "settle_event", { event_id: eventId });
  }
  return { eventId, released };
}

/** One typhoon, many regions: sign + settle one event per region, in sequence.
 * The contract takes a single region per event, so a real bulletin becomes a
 * loop of signed events. Two rules from the design doc apply here:
 * - unique nonces: same-millisecond Date.now() would trip NonceAlreadyUsed,
 *   so the batch derives nonce = now*1000 + index;
 * - flag, never fail: one region's error is recorded and the loop continues —
 *   a dry or broken region must not block the others' releases. */
export async function reportAndSettleMany(entries, role = "funder", onProgress) {
  const base = BigInt(Date.now()) * 1000n;
  const results = [];
  for (let i = 0; i < entries.length; i++) {
    const { region, signal } = entries[i];
    onProgress?.(region, { state: "running" });
    try {
      const { eventId, released } = await reportAndSettle(region, signal, role, base + BigInt(i));
      const res = { region, signal, eventId, released };
      results.push(res);
      onProgress?.(region, { state: "done", ...res });
    } catch (error) {
      const res = { region, signal, error };
      results.push(res);
      onProgress?.(region, { state: "error", error });
    }
  }
  return results;
}
