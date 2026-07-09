// Thin wrapper around the generated Soroban contract client.
// One client per demo identity; the client is built from the on-chain
// contract spec, so method names/args match lib.rs exactly.
import { Keypair, contract } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL, SECRETS } from "./config";

const keypairs = Object.fromEntries(
  Object.entries(SECRETS).map(([role, secret]) => [role, Keypair.fromSecret(secret)])
);

export const addr = (role) => keypairs[role].publicKey();

const clients = {};
async function clientFor(role) {
  if (!clients[role]) {
    const kp = keypairs[role];
    clients[role] = await contract.Client.from({
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: kp.publicKey(),
      ...contract.basicNodeSigner(kp, NETWORK_PASSPHRASE),
    });
  }
  return clients[role];
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

export async function reportAndSettle(region, signal) {
  const nonce = BigInt(Date.now());
  const sig = signEvent(region, signal, nonce);
  // The oracle key signs the PAYLOAD only — any funded account may relay the
  // event and crank settlement (the signature, not the submitter, is the
  // authority), so the funder identity submits both transactions.
  const eventId = await invoke("funder", "report_event", {
    region,
    signal,
    nonce,
    sig,
  });
  const released = await invoke("funder", "settle_event", { event_id: eventId });
  return { eventId, released };
}
