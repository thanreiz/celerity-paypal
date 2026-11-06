// The Java core proves it matches these rules with contracts/fixtures. If a
// rule here changes, the fixtures must be regenerated so Java is held to the
// new answer: node scripts/export-contracts.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const committed = path.join(here, "../../contracts/fixtures");

test("contracts/fixtures match what the Node rules answer today", () => {
  const fresh = mkdtempSync(path.join(tmpdir(), "contracts-"));
  try {
    const r = spawnSync(process.execPath, [path.join(here, "../scripts/export-contracts.mjs"), fresh], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const names = readdirSync(fresh).sort();
    assert.deepEqual(readdirSync(committed).sort(), names, "fixture files differ: run node scripts/export-contracts.mjs");
    for (const n of names) {
      assert.equal(readFileSync(path.join(committed, n), "utf8"), readFileSync(path.join(fresh, n), "utf8"), `${n} is out of date`);
    }
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});
