import React, { useEffect, useState } from "react";
import { addr, invoke, view } from "../lib/celerity";
import { fmtUnits, short, toStroops } from "../lib/config";

const FUNDERS = [
  { role: "funder", label: "ADB APDRF (alice)" },
  { role: "funder2", label: "NGO fund (funder 2)" },
];

export default function FunderView({ pools, busy, setBusy, refresh, notify }) {
  const [who, setWho] = useState("funder");
  const [form, setForm] = useState({
    amount: 5,
    region: 5,
    threshold: 3,
    payout: 1,
    installments: 1,
    period: 60,
  });
  const [ledger, setLedger] = useState([]);

  const me = addr(who);
  const myPools = pools.filter((p) => p.funder === me);

  useEffect(() => {
    view("funder_ledger", { funder: me })
      .then(setLedger)
      .catch(() => setLedger([]));
  }, [me, pools]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
      notify(`${label} ✓`);
      await new Promise((r) => setTimeout(r, 1500)); // let the RPC catch up to the write
      await refresh();
    } catch (e) {
      notify(`${label} failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const deposit = () =>
    run("Deposit", () =>
      invoke(who, "deposit", {
        funder: me,
        amount: toStroops(form.amount),
        region: Number(form.region),
        threshold: Number(form.threshold),
        payout: toStroops(form.payout),
        installments: Number(form.installments),
        claim_period_secs: BigInt(form.installments > 1 ? form.period : 0),
      })
    );

  return (
    <main>
      <section className="card">
        <h2>Fund an earmarked sub-pool</h2>
        <div className="identity">
          Acting as:{" "}
          {FUNDERS.map((f) => (
            <button
              key={f.role}
              className={who === f.role ? "on" : ""}
              onClick={() => setWho(f.role)}
            >
              {f.label}
            </button>
          ))}
          <span className="addr">{short(me)}</span>
        </div>
        <div className="row wrap">
          <label>
            Escrow (units)
            <input type="number" value={form.amount} onChange={set("amount")} />
          </label>
          <label>
            Region
            <input type="number" value={form.region} onChange={set("region")} />
          </label>
          <label>
            Signal ≥
            <input type="number" value={form.threshold} onChange={set("threshold")} />
          </label>
          <label>
            Payout / farmer
            <input type="number" value={form.payout} onChange={set("payout")} />
          </label>
          <label>
            Installments
            <input type="number" min="1" value={form.installments} onChange={set("installments")} />
          </label>
          {Number(form.installments) > 1 && (
            <label>
              Period (secs)
              <input type="number" value={form.period} onChange={set("period")} />
            </label>
          )}
          <button className="primary" disabled={busy} onClick={deposit}>
            Deposit — money locks now, moves only on a signed signal
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Sub-pools</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Funder</th>
              <th>Balance</th>
              <th>Rule</th>
              <th>Status</th>
              <th>Actions (own pools only)</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => (
              <tr key={String(p.id)} className={p.funder === me ? "mine" : ""}>
                <td>{String(p.id)}</td>
                <td>{p.funder === me ? "you" : short(p.funder)}</td>
                <td className="num">{fmtUnits(p.balance)}</td>
                <td>
                  region {p.region} · signal ≥ {p.signal_threshold} · {fmtUnits(p.payout_per_farmer)}
                  {p.installments > 1 ? ` ×${p.installments}` : ""} / farmer
                </td>
                <td>
                  <span className={`status ${p.status}`}>{p.status}</span>
                </td>
                <td>
                  {p.funder === me && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run("Top up", () =>
                            invoke(who, "top_up", { pool_id: p.id, amount: toStroops(1) })
                          )
                        }
                      >
                        +1 top up
                      </button>
                      {p.status === "Paused" ? (
                        <button
                          disabled={busy}
                          onClick={() => run("Resume", () => invoke(who, "resume_pool", { pool_id: p.id }))}
                        >
                          resume
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => run("Pause", () => invoke(who, "pause_pool", { pool_id: p.id }))}
                        >
                          pause
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() =>
                          run("Withdraw unspent", () =>
                            invoke(who, "withdraw_unspent", { pool_id: p.id })
                          )
                        }
                      >
                        withdraw
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {pools.length === 0 && (
              <tr>
                <td colSpan="6" className="empty">
                  No pools yet — make the first deposit above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Your release ledger — every peso accounted for</h2>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Pool</th>
              <th>Farmer</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((r, i) => (
              <tr key={i}>
                <td>#{String(r.event_id)}</td>
                <td>{String(r.pool_id)}</td>
                <td>{short(r.farmer)}</td>
                <td className="num">{fmtUnits(r.amount)}</td>
              </tr>
            ))}
            {ledger.length === 0 && (
              <tr>
                <td colSpan="4" className="empty">
                  No releases yet — they appear the moment a signed event settles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
