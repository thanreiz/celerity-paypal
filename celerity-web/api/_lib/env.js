/** Resolve server secrets. Prefer non-VITE_ names; fall back to legacy VITE_* for local migration. */
export function secret(name) {
  const v = process.env[name] || process.env[`VITE_${name}`];
  if (!v) throw new Error(`Missing server env ${name}`);
  return v;
}

export function publicConfig() {
  const CONTRACT_ID = process.env.VITE_CONTRACT_ID || process.env.CONTRACT_ID;
  const NETWORK_PASSPHRASE = process.env.VITE_NETWORK_PASSPHRASE || process.env.NETWORK_PASSPHRASE;
  const RPC_URL = process.env.VITE_RPC_URL || process.env.RPC_URL;
  if (!CONTRACT_ID || !NETWORK_PASSPHRASE || !RPC_URL) {
    throw new Error("Missing VITE_CONTRACT_ID / VITE_NETWORK_PASSPHRASE / VITE_RPC_URL");
  }
  return { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL };
}

export function demoGate() {
  return process.env.DEMO_GATE || "";
}
