// Signs a weather event exactly the way the Celerity contract verifies it:
//
//   payload = "CELERITY-EVENT-V1" || region (u32 BE) || signal (u32 BE) || nonce (u64 BE)
//   signature = Ed25519(ORACLE_SECRET, payload)
//
// Usage:  node sign-event.js <region> <signal> [nonce]
// The nonce defaults to the current unix time in milliseconds, giving each
// signed event a unique identity — the contract rejects a reused nonce, so a
// captured signature cannot be replayed into a second event.
//
// DEMO STUB: this stands in for a PAGASA/JMA feed signer. The signing key is
// injected from oracle/.env — never hardcoded, never committed.
import { Keypair } from "@stellar/stellar-sdk";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env"), quiet: true });

const [regionArg, signalArg, nonceArg] = process.argv.slice(2);
if (regionArg === undefined || signalArg === undefined) {
  console.error("Usage: node sign-event.js <region> <signal> [nonce]");
  console.error("Example (Typhoon signal 4 over Region V): node sign-event.js 5 4");
  process.exit(1);
}
if (!process.env.ORACLE_SECRET) {
  console.error("ORACLE_SECRET not set — run `node generate-key.js` first.");
  process.exit(1);
}

const region = Number(regionArg);
const signal = Number(signalArg);
const nonce = BigInt(nonceArg ?? Date.now());

const payload = Buffer.alloc(33);
Buffer.from("CELERITY-EVENT-V1", "ascii").copy(payload, 0);
payload.writeUInt32BE(region, 17);
payload.writeUInt32BE(signal, 21);
payload.writeBigUInt64BE(nonce, 25);

const kp = Keypair.fromSecret(process.env.ORACLE_SECRET);
const signature = kp.sign(payload).toString("hex");

console.log(
  JSON.stringify(
    {
      region,
      signal,
      nonce: nonce.toString(),
      signature,
      oracle_public_key: kp.rawPublicKey().toString("hex"),
    },
    null,
    2
  )
);
console.log("\n# Submit to the contract with:");
console.log(
  `stellar contract invoke --id celerity --source-account alice --network testnet -- \\\n` +
    `  report_event --region ${region} --signal ${signal} --nonce ${nonce} --sig ${signature}`
);
