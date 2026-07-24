import React from "react";
import Table from "../../design/Table";
import CountUp from "../../design/CountUp";
import { fmtUnits, CONTRACT_ID } from "../../lib/config";
import { phpValue } from "../../lib/anchor";
import { farmerLabel } from "../../lib/farmers";
import { poolName } from "../../lib/poolNames";
import { regionName } from "../../lib/regions";

const unitsOf = (stroops) => Number(BigInt(stroops)) / 1e7;

export default function LedgerPage({ ledger, pools }) {
  const totalUnits = ledger.reduce((sum, r) => sum + unitsOf(r.amount), 0);
  const poolById = Object.fromEntries(pools.map((p) => [String(p.id), p]));

  return (
    <div className="cel-stagger" style={{ display: "flex", flexDirection: "column", gap: 24, padding: "8px 28px 48px", maxWidth: 1120, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>Total Disbursed</p>
          <p style={{ margin: "4px 0 0", font: "var(--text-h1)", fontSize: 26, color: "var(--primary)", fontVariantNumeric: "tabular-nums" }}>
            <CountUp units={totalUnits} />{" "}
            <span style={{ font: "var(--text-meta)", color: "var(--text-faint)" }}>
              ≈ {totalUnits.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM
            </span>
          </p>
        </div>
      </div>

      <div className="cel-card-surface cel-raise" style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--container-highest)", background: "var(--surface-low)" }}>
          <h3 style={{ margin: 0, font: "var(--text-h2)", fontSize: 18 }}>Release History</h3>
        </div>
        <Table
          columns={[
            { key: "event_id", label: "Event", render: (r) => `#${String(r.event_id)}` },
            {
              key: "pool_id",
              label: "Pool",
              render: (r) => {
                const p = poolById[String(r.pool_id)];
                return p ? `${poolName(p)} (#${String(r.pool_id)})` : `#${String(r.pool_id)}`;
              },
            },
            {
              key: "region",
              label: "Region",
              render: (r) => {
                const p = poolById[String(r.pool_id)];
                return p ? regionName(p.region) : "—";
              },
            },
            { key: "farmer", label: "Farmer", render: (r) => farmerLabel(r.farmer) },
            {
              key: "amount",
              label: "Amount",
              num: true,
              render: (r) => (
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  <strong style={{ color: "var(--ok-text)" }}>{phpValue(unitsOf(r.amount))}</strong>{" "}
                  <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>· {fmtUnits(r.amount)} XLM</span>
                </span>
              ),
            },
          ]}
          rows={ledger}
          rowKey={(r, i) => `${r.event_id}-${r.pool_id}-${r.farmer}-${i}`}
          emptyText="No releases yet — they appear the moment a signed event settles."
        />
      </div>
      <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)" }}>
        Rows are on-chain releases from your pools only — the other funder sees their own ledger when they log in. Cross-check any row on{" "}
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--primary)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          stellar.expert ↗
        </a>
        .
      </p>
    </div>
  );
}
