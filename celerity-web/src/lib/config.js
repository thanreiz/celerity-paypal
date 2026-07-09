// All runtime configuration comes from .env (gitignored). See .env.example.
const need = (key) => {
  const v = import.meta.env[key];
  if (!v) throw new Error(`Missing ${key} — copy .env.example to .env and fill it in.`);
  return v;
};

export const RPC_URL = need("VITE_RPC_URL");
export const NETWORK_PASSPHRASE = need("VITE_NETWORK_PASSPHRASE");
export const CONTRACT_ID = need("VITE_CONTRACT_ID");

export const SECRETS = {
  funder: need("VITE_FUNDER_SECRET"),
  funder2: need("VITE_FUNDER2_SECRET"),
  farmer: need("VITE_FARMER_SECRET"),
  oracle: need("VITE_ORACLE_SECRET"),
};

// 1 unit (XLM on testnet, a USD-stablecoin in the narrative) = 10^7 stroops
export const UNIT = 10_000_000n;
export const fmtUnits = (stroops) =>
  (Number(BigInt(stroops)) / Number(UNIT)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
export const toStroops = (units) => BigInt(Math.round(Number(units) * Number(UNIT)));
export const short = (addr) => `${addr.slice(0, 4)}…${addr.slice(-4)}`;
