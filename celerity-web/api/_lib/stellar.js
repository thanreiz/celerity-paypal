import { Keypair, contract } from "@stellar/stellar-sdk";
import { publicConfig, secret } from "./env.js";

const ROLE_ENV = {
  funder: "FUNDER_SECRET",
  funder2: "FUNDER2_SECRET",
  farmer: "FARMER_SECRET",
  farmer2: "FARMER2_SECRET",
  admin: "FUNDER_SECRET", // alice holds admin in the demo slate
  oracle: "ORACLE_SECRET",
};

const ALLOWED_METHODS = new Set([
  "deposit",
  "top_up",
  "withdraw_unspent",
  "pause_pool",
  "resume_pool",
  "register_farmer",
  "remove_farmer",
  "report_event",
  "settle_event",
  "claim",
]);

const clients = {};

export function roleSecret(role) {
  const envName = ROLE_ENV[role];
  if (!envName) {
    const err = new Error(`Unknown role: ${role}`);
    err.status = 400;
    throw err;
  }
  return secret(envName);
}

export function addresses() {
  const out = {};
  for (const role of Object.keys(ROLE_ENV)) {
    out[role] = Keypair.fromSecret(roleSecret(role)).publicKey();
  }
  return out;
}

export async function clientFor(role) {
  if (!clients[role]) {
    const { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } = publicConfig();
    const kp = Keypair.fromSecret(roleSecret(role));
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

export async function invokeOnChain(role, method, args) {
  if (!ALLOWED_METHODS.has(method)) {
    const err = new Error(`Method not allowed: ${method}`);
    err.status = 400;
    throw err;
  }
  if (!ROLE_ENV[role] || role === "oracle") {
    const err = new Error(`Role cannot invoke: ${role}`);
    err.status = 400;
    throw err;
  }
  const c = await clientFor(role);
  if (typeof c[method] !== "function") {
    const err = new Error(`Unknown contract method: ${method}`);
    err.status = 400;
    throw err;
  }
  const tx = await c[method](args);
  const { result } = await tx.signAndSend();
  return result;
}

/** Sign CELERITY-EVENT-V1 || region || signal || nonce with the oracle key. */
export function signOracleEvent(region, signal, nonce) {
  const payload = Buffer.alloc(33);
  Buffer.from("CELERITY-EVENT-V1", "ascii").copy(payload, 0);
  payload.writeUInt32BE(Number(region), 17);
  payload.writeUInt32BE(Number(signal), 21);
  payload.writeBigUInt64BE(BigInt(nonce), 25);
  const kp = Keypair.fromSecret(roleSecret("oracle"));
  return {
    signature: Buffer.from(kp.sign(payload)),
    nonce: BigInt(nonce).toString(),
    region: Number(region),
    signal: Number(signal),
    oracle_public_key: kp.publicKey(),
  };
}
