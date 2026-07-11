import React from "react";
import { UNIT } from "../../lib/config";
import { toPHPNumber } from "../../lib/anchor";
import { funderLabel } from "../../lib/celerity";
import { receiptWhen, groupByBucket, formatDate } from "../../lib/activityTime";

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
  const regionOf = (poolId) => pools.find((p) => String(p.id) === String(poolId))?.region;

  const cashRows = cashOuts.map((c) => ({
    key: c.id,
    kind: "cashout",
    title: `Cashed out to ${c.destLabel}`,
    subtitle: "Cash-out",
    amountPhp: c.php,
    destLabel: c.destLabel,
    isDemo: true,
    when: c.when,
  }));

  // Installments claimed in-app this session — real time, appears immediately.
  const claimRows = claims.map((c) => {
    const pool = pools.find((p) => String(p.id) === String(c.poolId));
    const region = regionOf(c.poolId);
    return {
      key: c.id,
      kind: "received",
      title: `Claimed · ${pool ? funderLabel(pool.funder) : "relief"}`,
      subtitle: `${region != null ? `Region ${region} · ` : ""}Pool #${String(c.poolId)}`,
      amountPhp: c.php,
      funder: pool?.funder,
      pool_id: c.poolId,
      region,
      when: c.when,
    };
  });

  // Receipts have no on-chain time: newest = last in ledger order. Assign
  // synthesized dates by position from newest.
  const receiptRows = receipts.map((r, i) => {
    const units = Number(BigInt(r.amount)) / Number(UNIT);
    const region = regionOf(r.pool_id);
    const indexFromNewest = receipts.length - 1 - i;
    return {
      key: `r-${i}`,
      kind: "received",
      title: `Received · ${funderLabel(r.funder)}`,
      subtitle: `${region != null ? `Region ${region} · ` : ""}Pool #${String(r.pool_id)}`,
      amountPhp: toPHPNumber(units),
      funder: r.funder,
      pool_id: r.pool_id,
      region,
      when: receiptWhen(indexFromNewest, now),
    };
  });

  const rows = [...cashRows, ...receiptRows, ...claimRows].sort((a, b) => b.when - a.when);
  const groups = groupByBucket(rows, now);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 18px 18px" }}>
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
