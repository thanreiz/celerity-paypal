import React from "react";
import { addr, invoke } from "../lib/celerity";
import { fmtUnits, short, UNIT } from "../lib/config";
import { ANCHOR_LABEL, DEMO_PHP_RATE, toPHP } from "../lib/anchor";

export default function FarmerView({ pools, receipts, busy, setBusy, refresh, notify }) {
  const me = addr("farmer");
  const totalUnits = receipts.reduce((sum, r) => sum + Number(BigInt(r.amount)) / Number(UNIT), 0);

  const claim = async (poolId) => {
    setBusy(true);
    try {
      await invoke("farmer", "claim", { farmer: me, pool_id: poolId });
      notify("Installment claimed ✓");
      await new Promise((r) => setTimeout(r, 1500)); // let the RPC catch up to the write
      await refresh();
    } catch (e) {
      notify(`Claim: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <section className="card">
        <h2>Farmer wallet {short(me)}</h2>
        <div className="hero-numbers">
          <div>
            <div className="big">{totalUnits.toLocaleString()} units</div>
            <div className="sub">received on-chain, instantly, from {new Set(receipts.map((r) => r.funder)).size} funder(s)</div>
          </div>
          <div className="arrow">→</div>
          <div className="php">
            <div className="big">{toPHP(totalUnits)}</div>
            <div className="sub">
              spendable pesos at the edge · rate ₱{DEMO_PHP_RATE}/unit
            </div>
            <div className="badge stub">{ANCHOR_LABEL}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Recurring installments — claim when due</h2>
        <table>
          <thead>
            <tr>
              <th>Pool</th>
              <th>Funder</th>
              <th>Per installment</th>
              <th>Schedule</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pools
              .filter((p) => p.installments > 1)
              .map((p) => (
                <tr key={String(p.id)}>
                  <td>{String(p.id)}</td>
                  <td>{short(p.funder)}</td>
                  <td className="num">{fmtUnits(p.payout_per_farmer)}</td>
                  <td>
                    ×{p.installments}, every {String(p.claim_period_secs)}s
                  </td>
                  <td>
                    <button className="primary" disabled={busy} onClick={() => claim(p.id)}>
                      Claim next installment
                    </button>
                  </td>
                </tr>
              ))}
            {pools.filter((p) => p.installments > 1).length === 0 && (
              <tr>
                <td colSpan="5" className="empty">
                  No recurring pools yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="fine">
          Too early → the contract refuses (ClaimNotDueYet). Paused by the funder → blocked. The
          schedule is enforced on-chain, not by this page.
        </p>
      </section>

      <section className="card">
        <h2>Received payments</h2>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Pool</th>
              <th>From funder</th>
              <th>Amount</th>
              <th>≈ PHP (demo)</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r, i) => (
              <tr key={i}>
                <td>#{String(r.event_id)}</td>
                <td>{String(r.pool_id)}</td>
                <td>{short(r.funder)}</td>
                <td className="num">{fmtUnits(r.amount)}</td>
                <td className="num">{toPHP(Number(BigInt(r.amount)) / Number(UNIT))}</td>
              </tr>
            ))}
            {receipts.length === 0 && (
              <tr>
                <td colSpan="5" className="empty">
                  Nothing yet — payments appear seconds after a signed typhoon signal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
