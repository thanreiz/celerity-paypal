import React, { useState } from "react";
import { reportAndSettle } from "../lib/celerity";
import { friendlyError } from "../lib/errors";

/**
 * DEMO oracle simulator. Signs "region, signal, nonce" with the same Ed25519
 * key as oracle/sign-event.js and submits report_event + settle_event. In
 * production this signature comes from the weather authority's feed — the
 * contract can't tell the difference, which is the point.
 */
export default function OraclePanel({ busy, setBusy, refresh, notify }) {
  const [region, setRegion] = useState(5);
  const [signal, setSignal] = useState(4);
  const [last, setLast] = useState(null);

  const trigger = async () => {
    setBusy(true);
    try {
      const { eventId, released } = await reportAndSettle(Number(region), Number(signal));
      setLast({ eventId, released });
      notify(`Event ${eventId} settled — ${released} release(s) paid.`);
      await new Promise((r) => setTimeout(r, 1500)); // let the RPC catch up to the write
      await refresh();
    } catch (e) {
      notify(`Oracle: ${friendlyError(e)}`, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="oracle">
      <div className="oracle-head">
        <strong>🌀 Weather oracle</strong>
        <span className="badge stub">demo signer — stands in for the PAGASA/JMA feed</span>
      </div>
      <div className="row">
        <label>
          Region
          <input type="number" min="1" value={region} onChange={(e) => setRegion(e.target.value)} />
        </label>
        <label>
          Typhoon signal
          <input type="number" min="1" max="5" value={signal} onChange={(e) => setSignal(e.target.value)} />
        </label>
        <button className="primary" disabled={busy} onClick={trigger}>
          Sign event &amp; settle all matching pools
        </button>
        {last && (
          <span className="oracle-result">
            event #{String(last.eventId)} → {last.released} release(s)
          </span>
        )}
      </div>
      <p className="fine">
        Ed25519-signed payload, verified on-chain; replays rejected. One signal releases{" "}
        <em>every</em> matching funder's pool at once — no claims process.
      </p>
    </section>
  );
}
