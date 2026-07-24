// Thin wrapper around the Soroban contract.
// Reads: browser simulation (no secrets).
// Writes + oracle sign: POST /api/* with DEMO_GATE (secrets stay server-side).
import { contract, rpc } from "@stellar/stellar-sdk";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL, short } from "./config";
import { FUNDERS } from "./funders";
import { apiAddresses, apiInvoke, apiOracleSign } from "./api";

let ADDRESSES = null;
let addressesPromise = null;

/** Load public demo addresses from the server (cached). */
export async function loadAddresses() {
  if (ADDRESSES) return ADDRESSES;
  if (!addressesPromise) {
    addressesPromise = apiAddresses().then((addrs) => {
      ADDRESSES = addrs;
      return addrs;
    });
  }
  return addressesPromise;
}

export function addr(role) {
  if (!ADDRESSES || !ADDRESSES[role]) {
    throw new Error(`Address for "${role}" not loaded — call loadAddresses() first`);
  }
  return ADDRESSES[role];
}

export function funderLabel(funderAddr) {
  if (!ADDRESSES) return `Relief program (${short(funderAddr)})`;
  for (const f of FUNDERS) {
    if (ADDRESSES[f.role] === funderAddr) return f.label;
  }
  return `Relief program (${short(funderAddr)})`;
}

// Signer-less client for read-only simulation.
let viewClientPromise = null;
function viewClient() {
  if (!viewClientPromise) {
    viewClientPromise = loadAddresses().then((addrs) =>
      contract.Client.from({
        contractId: CONTRACT_ID,
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: RPC_URL,
        publicKey: addrs.funder,
      })
    );
  }
  return viewClientPromise;
}

/** Submit a state-changing call as `role` via the gated signing API. */
export async function invoke(role, method, args) {
  return apiInvoke(role, method, args);
}

/** Read-only call (simulation only, no signature, no fee). */
export async function view(method, args) {
  const c = await viewClient();
  const tx = await c[method](args);
  if (tx.result && typeof tx.result === "object" && "error" in tx.result) {
    const simError = tx.simulation && rpc.Api.isSimulationError(tx.simulation) ? tx.simulation.error : null;
    throw new Error(simError || "Simulation error");
  }
  return tx.result;
}

function isPoolNotFound(e) {
  const raw = String((e && (e.message || e)) || "");
  return /Error\(Contract, #3\)/.test(raw);
}

export async function allPools() {
  const pools = [];
  for (let id = 1n; ; id++) {
    let p;
    let lastErr;
    let got = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        p = await view("pool", { pool_id: id });
        got = true;
        break;
      } catch (e) {
        if (isPoolNotFound(e)) return pools;
        lastErr = e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (!got) {
      throw lastErr || new Error("Could not read pools (RPC unavailable)");
    }
    if (!p || p.status === undefined) return pools;
    pools.push({ id, ...p, status: p.status.tag ?? p.status });
  }
}

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

export async function farmersByRegion(pools) {
  const regions = [...new Set(pools.map((p) => p.region))].sort((a, b) => a - b);
  const groups = [];
  for (const region of regions) {
    const addrs = await view("farmers_in_region", { region });
    const list = await Promise.all(addrs.map((a) => view("farmer", { addr: a })));
    groups.push({ region, list });
  }
  return groups;
}

export async function registerFarmer(farmerAddr, region) {
  return invoke("admin", "register_farmer", { addr: farmerAddr, region: Number(region) });
}

export async function removeFarmer(farmerAddr) {
  return invoke("admin", "remove_farmer", { addr: farmerAddr });
}

export async function signEvent(region, signal, nonce) {
  const signed = await apiOracleSign(region, signal, nonce);
  return signed.signature;
}

export async function reportAndSettle(region, signal, role = "funder", nonce = BigInt(Date.now())) {
  const signed = await apiOracleSign(region, signal, nonce);
  const eventId = await invoke(role, "report_event", {
    region,
    signal,
    nonce: signed.nonce,
    sig: signed.signature,
  });
  const event_id = typeof eventId === "bigint" ? eventId : BigInt(eventId);
  let released;
  try {
    released = await invoke(role, "settle_event", { event_id });
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    released = await invoke(role, "settle_event", { event_id });
  }
  return { eventId: event_id, released };
}

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
