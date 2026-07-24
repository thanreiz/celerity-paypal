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
  // Second farmer (Aling Nena) — View-as switch in the farmer app.
  farmer2: need("VITE_FARMER2_SECRET"),
  oracle: need("VITE_ORACLE_SECRET"),
  // The contract's admin (LGU registrar). In the demo deployment alice holds
  // both roles, but registry calls must sign AS the admin, not as a funder.
  admin: need("VITE_FUNDER_SECRET"),
};

// 1 unit (XLM on testnet, a USD-stablecoin in the narrative) = 10^7 stroops
export const UNIT = 10_000_000n;
export const fmtUnits = (stroops) =>
  (Number(BigInt(stroops)) / Number(UNIT)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
// Guards against a cleared/empty number input: Number("") is NaN, and
// BigInt(NaN) throws a raw RangeError that would otherwise surface as an
// unfriendly toast. Treat anything non-finite as 0 rather than crash.
export const toStroops = (units) => {
  const n = Number(units) * Number(UNIT);
  return Number.isFinite(n) ? BigInt(Math.round(n)) : 0n;
};
export const short = (addr) => `${addr.slice(0, 4)}…${addr.slice(-4)}`;
