import React, { useState } from "react";
import Button from "../../design/Button";
import { fmtUnits, UNIT } from "../../lib/config";
import { toPHP, phpValue, toPHPNumber } from "../../lib/anchor";
import { funderLabel } from "../../lib/celerity";
import { useCountUp } from "../../lib/useCountUp";
import { receiptWhen, formatDate } from "../../lib/activityTime";

/**
 * Farmer home — a plain-language, mobile-banking-style wallet.
 *
 * Balance is the live spendable amount (received on-chain minus demo cash-outs),
 * passed in as availableUnits and animated with a count-up. Claim state is
 * data-driven: a pool whose installments are all paid out shows a non-pressable
 * "Fully paid out" chip instead of a Claim button, so nothing errors. Copy stays
 * plain and pesos-only.
 */
export default function HomeScreen({ pools, receipts, cashOuts = [], availableUnits, busy, claim, onCashOut, onHistory, onDetail, onOpenTx }) {
  const [hidden, setHidden] = useState(false);
  const shownUnits = useCountUp(availableUnits);

  const regionOf = (poolId) => pools.find((p) => String(p.id) === String(poolId))?.region;
  const claimedCount = (pool) =>
    receipts.filter((r) => String(r.pool_id) === String(pool.id)).length;
  // Only pools with something still to claim — fully-paid ones are hidden so
  // Home stays uncluttered (they're still visible under Installments).
  const claimable = pools.filter((p) => p.installments > 1 && claimedCount(p) < p.installments);

  // Merged recent activity, newest first: demo cash-outs (−, real time) and
  // relief receipts (+, demo dates by on-chain order). Same rows + timestamps
  // the Activity screen uses, so a row tapped here matches its detail there.
  const now = Date.now();
  const cashRows = cashOuts.map((c) => ({ key: c.id, kind: "cashout", title: `Cashed out to ${c.destLabel}`, amountPhp: c.php, destLabel: c.destLabel, isDemo: true, when: c.when }));
  const receiptRows = receipts.map((r, i) => {
    const units = Number(BigInt(r.amount)) / Number(UNIT);
    return { key: `r-${i}`, kind: "received", title: `Received · ${funderLabel(r.funder)}`, amountPhp: toPHPNumber(units), funder: r.funder, pool_id: r.pool_id, region: regionOf(r.pool_id), when: receiptWhen(receipts.length - 1 - i, now) };
  });
  const recentRows = [...cashRows, ...receiptRows].sort((a, b) => b.when - a.when).slice(0, 4);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15, padding: "6px 18px 22px" }}>
      {/* greeting */}
      <div className="cel-fade" style={{ padding: "2px 2px 0" }}>
        <span style={{ font: "var(--text-body)", fontSize: 15, fontWeight: 600, color: "var(--text-dim)" }}>
          Kumusta, <b style={{ color: "var(--text)", fontWeight: 700 }}>Ramon</b> 🌾
        </span>
      </div>

      {/* hero balance */}
      <div
        className="cel-fade cel-fade-1"
        style={{
          background: "linear-gradient(158deg, var(--primary) 0%, var(--primary-hover) 100%)",
          borderRadius: "var(--radius-card)",
          padding: "20px 20px 18px",
          color: "var(--on-primary)",
          boxShadow: "var(--shadow-raised)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ font: "var(--text-label)", color: "rgba(255,255,255,0.82)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)" }}>
            Available Balance
          </div>
          <button
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? "Show balance" : "Hide balance"}
            className="cel-press"
            style={{
              background: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.28)",
              color: "#fff",
              width: 30,
              height: 30,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            {hidden ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M6.5 6.6a2 2 0 0 0 2.8 2.8M4.3 4.4C2.4 5.6 1 8 1 8s2.6 4.5 7 4.5c1.2 0 2.2-.3 3.1-.7M9.5 3.6C9 3.5 8.5 3.5 8 3.5 3.6 3.5 1 8 1 8m14 0s-.9-1.6-2.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.3" /></svg>
            )}
          </button>
        </div>
        <div style={{ font: "var(--text-hero)", fontSize: 40, margin: "8px 0 2px", color: "var(--on-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {hidden ? "₱ ••••••" : toPHP(shownUnits)}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Button variant="on" className="cel-press" style={{ flex: 1, justifyContent: "center", background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }} onClick={onCashOut}>
            ↓ Withdraw to pesos
          </Button>
          <Button variant="on" className="cel-press" style={{ flex: 1, justifyContent: "center", background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }} onClick={onHistory}>
            🧾 History
          </Button>
        </div>
      </div>

      {/* claim cards — real recurring pools, data-driven claim state */}
      {claimable.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={sectionLabel}>Relief to claim</p>
          {claimable.map((p, i) => {
            const done = claimedCount(p);
            const total = p.installments;
            const amount = phpValue(Number(BigInt(p.payout_per_farmer)) / Number(UNIT));
            return (
              <div key={String(p.id)} className={`cel-fade cel-fade-${Math.min(i + 2, 4)}`} style={claimCardStyle(true)}>
                <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                  <div style={claimIconStyle}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3c-2 3-3.5 5.2-3.5 8a3.5 3.5 0 0 0 7 0c0-2.8-1.5-5-3.5-8Z" fill="currentColor" /><path d="M12 21v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "var(--text-label)", color: "var(--ok-text)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)" }}>
                      Relief has arrived
                    </div>
                    <div style={{ font: "var(--text-body)", fontSize: 15, fontWeight: 600, color: "var(--text)", lineHeight: 1.35, marginTop: 3 }}>
                      You have <b style={{ fontWeight: 700 }}>{amount}</b> ready to claim.
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <ProgressDots done={done} total={total} />
                      <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>
                        {done} of {total} claimed · every {String(p.claim_period_secs)}s
                      </span>
                    </div>
                  </div>
                </div>

                <Button variant="primary" className="cel-press" disabled={busy} onClick={() => claim(p.id)} style={{ width: "100%", marginTop: 14, fontSize: 17, minHeight: 50 }}>
                  Claim {amount}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* quick actions */}
      <div className="cel-fade cel-fade-3" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, background: "#fff", borderRadius: "var(--radius-card)", padding: "18px 12px", boxShadow: "var(--shadow-card)" }}>
        <QuickAction label="Relief Programs" onClick={() => onDetail("programs")} emoji="🌾" />
        <QuickAction label="Installments" onClick={() => onDetail("installments")} emoji="📅" />
        <QuickAction label="My Region" onClick={() => onDetail("region")} emoji="📍" />
        <QuickAction label="Help" onClick={() => onDetail("help")} emoji="☎️" />
      </div>

      {/* recent activity — merged cash-outs (−) + relief receipts (+) */}
      <div className="cel-fade cel-fade-4">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 0" }}>
          <p style={sectionLabel}>Recent activity</p>
          {recentRows.length > 0 && (
            <button onClick={onHistory} className="cel-press" style={{ background: "none", border: "none", cursor: "pointer", font: "var(--text-fine)", fontSize: 12.5, fontWeight: 700, color: "var(--primary)", fontFamily: "var(--font-sans)" }}>
              See all
            </button>
          )}
        </div>
        {recentRows.length === 0 ? (
          <p style={{ margin: "8px 4px 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>
            Nothing yet — money appears seconds after a signed typhoon signal.
          </p>
        ) : (
          <div style={{ marginTop: 10, background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", border: "1px solid var(--container-highest)", overflow: "hidden" }}>
            {recentRows.map((row, i) => {
              const isReceived = row.kind === "received";
              return (
                <button
                  key={row.key}
                  onClick={() => (onOpenTx ? onOpenTx(row) : onHistory())}
                  className="cel-row"
                  style={{ width: "100%", textAlign: "left", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", border: "none", borderTop: i === 0 ? "none" : "1px solid var(--surface-low)", fontFamily: "var(--font-sans)" }}
                >
                  <div style={isReceived ? histIconStyle : histIconOutStyle}>
                    {isReceived ? (
                      <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M4.5 7.5 8 11l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><path d="M8 13V5M4.5 8.5 8 5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "var(--text-table)", fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>
                      {row.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1, flexWrap: "wrap" }}>
                      <span style={{ font: "var(--text-fine)", fontSize: 12, color: "var(--text-faint)" }}>
                        {formatDate(row.when, now)}
                      </span>
                      {row.isDemo && (
                        <span style={{ font: "var(--text-label)", fontSize: 9.5, fontWeight: 700, color: "var(--warn-text)", background: "var(--warn-bg)", border: "1px solid var(--warn-line)", borderRadius: 999, padding: "1px 6px", letterSpacing: "0.04em", textTransform: "uppercase" }}>Demo</span>
                      )}
                    </div>
                  </div>
                  <div style={{ font: "var(--text-money)", fontSize: 15, color: isReceived ? "var(--ok-text)" : "var(--text)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {isReceived ? "+" : "−"}₱{Math.round(row.amountPhp).toLocaleString()}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressDots({ done, total }) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: i < done ? "var(--ok-text)" : "var(--container-highest)",
          }}
        />
      ))}
    </span>
  );
}

function QuickAction({ emoji, label, onClick }) {
  return (
    <button onClick={onClick} className="cel-press" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--container)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>
        {emoji}
      </div>
      <span style={{ font: "var(--text-fine)", fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>{label}</span>
    </button>
  );
}

const sectionLabel = {
  margin: "0 0 0 2px",
  font: "var(--text-label)",
  color: "var(--text-faint)",
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-label)",
};

const claimCardStyle = (isClaimable) => ({
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  border: `1px solid ${isClaimable ? "var(--ok-line)" : "var(--container-highest)"}`,
  padding: 16,
});

const claimIconStyle = {
  width: 44,
  height: 44,
  borderRadius: 13,
  background: "var(--ok-bg)",
  color: "var(--ok-text)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const histIconStyle = {
  width: 38,
  height: 38,
  borderRadius: 11,
  background: "var(--ok-bg)",
  color: "var(--ok-text)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const histIconOutStyle = {
  ...{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", flexShrink: 0 },
  background: "var(--container)",
  color: "var(--primary)",
};
