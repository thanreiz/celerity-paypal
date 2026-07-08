# Celerity oracle signer (demo stub)

Simulates the PAGASA/JMA signed weather feed: an Ed25519 key signs
`(region, signal, nonce)` payloads that the contract's `report_event`
verifies against its stored oracle public key. Only the signature is the
authority — anyone may relay a signed event, and nobody can forge one.

This is a labeled **demo stub**: in production this key would live with the
weather authority (or an attestation service over its feed), not with us.

```bash
npm install
node generate-key.js          # writes oracle/.env (gitignored); prints PUBLIC key hex
node sign-event.js 5 4        # sign "Typhoon signal 4 over Region V", nonce = now
```

`generate-key.js` prints the public key hex to pass as the `--oracle`
constructor argument at deploy. The secret stays in `oracle/.env` — never
committed, never printed.
