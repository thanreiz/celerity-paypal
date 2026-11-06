# Contract fixtures

Each file in `fixtures/` holds one rule, one input, and the answer the **Node** rules give for it:

```json
{ "name": "...", "op": "policy/check-draft", "input": { "currency": "PHP", "now": "...", "state": {}, "run": {}, "draft": {} }, "expected": { "errors": [] } }
```

The Java core (`core/`) must give the same answer for every file; its `ParityTest` reads them all.

**When a rule changes:** change it in `server/src`, regenerate, and commit the fixtures with the change:

```bash
cd server && node scripts/export-contracts.mjs
```

`server/test/contracts.test.js` fails if the committed fixtures don't match what the Node rules answer today. Then CI's Java job fails until the Java port gives the new answers too.

**What the fixtures cover:**
- Fixed dates (2000 and 2099) and a fixed `now`, so the 7-day cooldown gives the same result whenever they run.
- No names, emails or tokens beyond the seeded demo data.
