import React from "react";
import { groupByBucket, formatDate } from "../../lib/activityTime";
import { buildActivityRows } from "../../lib/activityRows";

const php = (n) => `₱${Math.round(n).toLocaleString()}`;

/**
 * Activity — the farmer's money history. Merges real on-chain relief receipts
 * (incoming +) with demo cash-outs (outgoing −), newest first, grouped under
 * date section headers (Today / Yesterday / This week / Earlier). Each row is
 * tappable and opens the transaction detail. Cash-outs are tagged "Demo" and
 * carry real timestamps; receipt dates are demo-generated from on-chain order.
 */
export default function ActivityScreen({ receipts, pools, cashOuts = [], claims = [], onOpenTx }) {
  const now = Date.now();
  // One shared builder feeds both this screen and Home, and reconciles claims
  // against on-chain receipts so a claimed installment never double-lists.
  const rows = buildActivityRows({ receipts, claims, cashOuts, pools, now });
  const groups = groupByBucket(rows, now);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 18px 18px" }} className="cel-stagger">
      {rows.length === 0 && (
        <p style={{ font: "var(--text-body)", color: "var(--text-faint)", padding: "8px 4px" }}>
          Nothing yet — payments appear seconds after a signed typhoon signal.
        </p>
      )}

      {groups.map((group, gi) => (
        <div key={group.bucket} className={`cel-fade cel-fade-${Math.min(gi + 1, 4)}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={sectionLabel}>{group.bucket}</p>
          {group.rows.map((row) => {
            const isReceived = row.kind === "received";
            return (
              <button
                key={row.key}
                onClick={() => onOpenTx && onOpenTx(row)}
                className="cel-row"
                style={txCardStyle}
              >
                <div style={txIconStyle(isReceived)}>
                  {isReceived ? (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M4.5 7.5 8 11l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 13V5M4.5 8.5 8 5l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{row.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{formatDate(row.when, now)}</span>
                    <span style={{ color: "var(--container-highest)" }}>·</span>
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{row.subtitle}</span>
                    {row.pending && <PendingTag />}
                    {row.isDemo && <DemoTag />}
                  </div>
                </div>
                <div style={{ font: "var(--text-money)", color: isReceived ? "var(--ok-text)" : "var(--text)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {isReceived ? "+" : "−"}
                  {php(row.amountPhp)}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// A claim recorded in-app whose on-chain receipt hasn't been read back yet.
function PendingTag() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "var(--text-label)", fontSize: 9.5, fontWeight: 700, color: "var(--primary)", background: "var(--container)", borderRadius: 999, padding: "1px 7px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
      <span className="cel-pulse" style={{ width: 5, height: 5, borderRadius: 999, background: "var(--primary)" }} />
      Arriving
    </span>
  );
}

function DemoTag() {
  return (
    <span style={{ font: "var(--text-label)", fontSize: 9.5, fontWeight: 700, color: "var(--warn-text)", background: "var(--warn-bg)", border: "1px solid var(--warn-line)", borderRadius: 999, padding: "1px 6px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
      Demo
    </span>
  );
}

const sectionLabel = {
  margin: "6px 0 0 2px",
  font: "var(--text-label)",
  color: "var(--text-faint)",
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-label)",
};

const txCardStyle = {
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--container-highest)",
  padding: "14px 16px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  width: "100%",
};

const txIconStyle = (isReceived) => ({
  width: 40,
  height: 40,
  borderRadius: 11,
  background: isReceived ? "var(--ok-bg)" : "var(--container)",
  color: isReceived ? "var(--ok-text)" : "var(--primary)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
});
