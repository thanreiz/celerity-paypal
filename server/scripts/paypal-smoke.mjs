// PayPal sandbox smoke test: OAuth token -> one Payout -> poll until final.
//
//   cd server && npm run smoke
//
// Needs PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and SMOKE_RECEIVER_EMAIL
// (a sandbox *personal* account from developer.paypal.com > Sandbox accounts).

import { createPayoutBatch, getAccessToken, getPayoutBatch } from "../src/paypal.js";
import { config } from "../src/config.js";

const receiver = process.env.SMOKE_RECEIVER_EMAIL;
if (!receiver) {
  console.error("Set SMOKE_RECEIVER_EMAIL to a PayPal sandbox personal account email.");
  process.exit(1);
}
if (config.paypal.env !== "sandbox") {
  console.error("Refusing to run the smoke test against live PayPal.");
  process.exit(1);
}

const FINAL = new Set(["SUCCESS", "DENIED", "CANCELED"]);

const t0 = Date.now();
await getAccessToken();
console.log(`1. OAuth token OK (${Date.now() - t0} ms)`);

const senderBatchId = `celerity-smoke-${Date.now()}`;
const created = await createPayoutBatch({
  senderBatchId,
  emailSubject: "Celerity Relief smoke test",
  emailMessage: "Sandbox smoke test payout.",
  items: [
    {
      receiver,
      amount: 1,
      currency: process.env.PAYOUT_CURRENCY || "USD",
      note: "Celerity Relief smoke test",
      senderItemId: `${senderBatchId}-1`,
    },
  ],
});
const batchId = created.batch_header.payout_batch_id;
console.log(`2. Payout batch created: ${batchId} (${created.batch_header.batch_status})`);

for (let i = 0; i < 30; i++) {
  const batch = await getPayoutBatch(batchId);
  const status = batch.batch_header.batch_status;
  const item = batch.items?.[0];
  console.log(`3. poll ${i + 1}: batch ${status}, item ${item?.transaction_status ?? "-"}`);
  if (FINAL.has(status)) {
    console.log(
      status === "SUCCESS"
        ? `Done. Item ${item?.payout_item_id}, transaction ${item?.transaction_id ?? "n/a"}.`
        : `Batch ended ${status}: ${JSON.stringify(item?.errors ?? batch.batch_header)}`
    );
    process.exit(status === "SUCCESS" ? 0 : 2);
  }
  await new Promise((r) => setTimeout(r, 4000));
}
console.error("Timed out waiting for the batch to finish (it may still complete; check the sandbox dashboard).");
process.exit(3);
