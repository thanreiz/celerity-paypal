// Generates the demo oracle keypair and stores the SECRET in oracle/.env
// (gitignored, mode 600). Prints ONLY the public key — the secret never
// appears on stdout, in logs, or in committed code.
import { Keypair } from "@stellar/stellar-sdk";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, ".env");

if (existsSync(envPath)) {
  console.error("oracle/.env already exists — refusing to overwrite the oracle key.");
  console.error("Delete it yourself if you really want a new key (the deployed");
  console.error("contract trusts the OLD public key until you redeploy).");
  process.exit(1);
}

const kp = Keypair.random();
writeFileSync(envPath, `ORACLE_SECRET=${kp.secret()}\n`, { mode: 0o600 });

console.log("Oracle keypair generated. Secret written to oracle/.env (gitignored).");
console.log("Public key (hex) — pass as the contract constructor's --oracle arg:");
console.log(kp.rawPublicKey().toString("hex"));
