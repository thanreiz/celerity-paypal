// Public runtime config only. Signing secrets live on the server (/api/*)
// behind DEMO_GATE — never VITE_*_SECRET (Vite would bake them into the bundle).
//
// IMPORTANT: access import.meta.env.VITE_* with STATIC property names only.
// Dynamic import.meta.env[key] makes Vite embed every VITE_* var from .env.

const RPC_URL = import.meta.env.VITE_RPC_URL;
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE;
const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID;

if (!RPC_URL || !NETWORK_PASSPHRASE || !CONTRACT_ID) {
  throw new Error(
    "Missing VITE_RPC_URL / VITE_NETWORK_PASSPHRASE / VITE_CONTRACT_ID — copy .env.example to .env"
  );
}

export { RPC_URL, NETWORK_PASSPHRASE, CONTRACT_ID };

// 1 unit (XLM on testnet, a USD-stablecoin in the narrative) = 10^7 stroops
export const UNIT = 10_000_000n;
export const fmtUnits = (stroops) =>
  (Number(BigInt(stroops)) / Number(UNIT)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
export const toStroops = (units) => {
  const n = Number(units) * Number(UNIT);
  return Number.isFinite(n) ? BigInt(Math.round(n)) : 0n;
};
export const short = (addr) => `${addr.slice(0, 4)}…${addr.slice(-4)}`;
