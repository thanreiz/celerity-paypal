import React, { useEffect, useState } from "react";
import CountUp from "../../design/CountUp";
import { allPools, view } from "../../lib/celerity";
import { fmtUnits, short } from "../../lib/config";
import { toPHP } from "../../lib/anchor";

export default function TransparencyLedgerPage({ onBack }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pools = await allPools();
      const regionByPool = Object.fromEntries(pools.map((p) => [String(p.id), p.region]));
      const funders = [...new Set(pools.map((p) => p.funder))];
      const all = [];
      for (const funder of funders) {
        const ledger = await view("funder_ledger", { funder });
        all.push(...ledger);
      }
      if (!cancelled) {
        setReleases(all.map((r) => ({ ...r, region: regionByPool[String(r.pool_id)] })));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalUnits = releases.reduce((sum, r) => sum + Number(BigInt(r.amount)) / 1e7, 0);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--paper-page)", fontFamily: "var(--font-sans)" }}>
      <header style={{ padding: "24px 40px", borderBottom: "1px solid var(--container-highest)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, font: "var(--text-h1)", fontSize: 24, color: "var(--primary)" }}>Celerity — Public Transparency Ledger</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>No login required</span>
          {onBack && (
            <button onClick={onBack} className="cel-press" style={{ border: "none", background: "var(--container-high)", borderRadius: 999, padding: "8px 16px", cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 700 }}>
              ← Back
            </button>
          )}
        </div>
      </header>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 80px", display: "flex", flexDirection: "column", gap: 24, boxSizing: "border-box" }}>
        <section style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", border: "1px solid var(--container-highest)", padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ margin: 0, font: "var(--text-label)", textTransform: "uppercase", color: "var(--text-faint)" }}>Total Disbursed Across All Relief Efforts</p>
            <p style={{ margin: "8px 0 0", font: "var(--text-display)", fontSize: 40, color: "var(--primary)", fontVariantNumeric: "tabular-nums" }}>
              <CountUp units={totalUnits} format="full" placeholder={loading ? toPHP(0) : undefined} />
            </p>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--container-high)", padding: "8px 16px", borderRadius: 999, font: "var(--text-label)", textTransform: "uppercase", color: "var(--text-dim)" }}>
            <span className="cel-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)" }} /> Live Stellar Testnet
          </span>
        </section>

        <section style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", border: "1px solid var(--container-highest)", overflow: "hidden" }}>
          {loading && (
            <div style={{ padding: 24, font: "var(--text-fine)", color: "var(--text-faint)" }}>Loading on-chain releases…</div>
          )}
          {!loading && releases.length === 0 && (
            <div style={{ padding: 24, font: "var(--text-fine)", color: "var(--text-faint)" }}>No releases yet — they appear the moment a signed event settles.</div>
          )}
          {releases.map((r, i) => (
            <div
              key={`${r.event_id}-${r.pool_id}-${r.farmer}-${i}`}
              className="cel-row"
              style={{
                padding: 20,
                borderBottom: i < releases.length - 1 ? "1px solid var(--container-highest)" : "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
                animation: "celFadeUp 420ms cubic-bezier(.2,.7,.2,1) both",
                animationDelay: `${Math.min(i, 12) * 35}ms`,
              }}
            >
              <div>
                <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>event #{String(r.event_id)} · pool #{String(r.pool_id)}{r.region !== undefined ? ` · region ${r.region}` : ""}</span>
                <p style={{ margin: "4px 0 0", font: "var(--text-body-lg)" }}>
                  {short(r.funder)} released {fmtUnits(r.amount)} units to {short(r.farmer)}
                </p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                <div style={{ font: "var(--text-money)", color: "var(--primary)" }}>{fmtUnits(r.amount)} units</div>
                <div style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>≈ {toPHP(Number(BigInt(r.amount)) / 1e7)}</div>
              </div>
            </div>
          ))}
        </section>

        <footer style={{ textAlign: "center", padding: "24px 0", color: "var(--text-faint)", font: "var(--text-label)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)" }}>
          All transactions are immutably recorded on Stellar Testnet for audit and verification purposes.
        </footer>
      </div>
    </div>
  );
}
