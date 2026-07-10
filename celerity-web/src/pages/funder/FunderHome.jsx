import React from "react";
import DemoGuide from "./DemoGuide";
import { phpValue } from "../../lib/anchor";
import { fmtUnits, short, CONTRACT_ID } from "../../lib/config";
import { poolName } from "../../lib/poolNames";
import { regionName } from "../../lib/regions";

const unitsOf = (stroops) => Number(BigInt(stroops)) / 1e7;

const QUICK_ACTIONS = [
  {
    page: "pools",
    label: "My Pools",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 9.5 12 4l9 5.5" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" />
      </svg>
    ),
  },
  {
    page: "farmers",
    label: "Farmers (LGU)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3.2 2.6-5 5.5-5s5.5 1.8 5.5 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 15.2c2 .7 3.5 2.2 3.5 4.8" />
      </svg>
    ),
  },
  {
    page: "oracle",
    label: "Trigger Typhoon",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5Z" />
      </svg>
    ),
  },
  {
    page: "ledger",
    label: "Ledger",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />
      </svg>
    ),
  },
  {
    page: "settings",
    label: "Settings",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" /><circle cx="15" cy="7" r="1.8" /><circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="17" r="1.8" />
      </svg>
    ),
  },
];

function FeedRow({ row, pool }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", borderTop: "1px solid var(--surface-low)" }}>
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "var(--ok-bg)",
          color: "var(--ok-text)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 4v16m0 0 6-6m-6 6-6-6" />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--text-body-lg)", fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>
          {pool ? poolName(pool) : `Pool #${String(row.pool_id)}`} → {short(row.farmer)}
        </div>
        <div style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>
          {pool ? regionName(pool.region) : "—"} · pool #{String(row.pool_id)}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        <div style={{ font: "var(--text-money)", fontSize: 15, color: "var(--ok-text)" }}>{phpValue(unitsOf(row.amount))}</div>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank"
          rel="noreferrer"
          style={{ font: "var(--text-fine)", fontSize: 11, color: "var(--text-faint)", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          on-chain ↗
        </a>
      </div>
    </div>
  );
}

/** GCash-style funder home: hero balance, circular quick-actions, the
 * state-driven demo guide, then recent releases grouped by event. Everything
 * on screen is scoped to the logged-in funder — the other funder's money
 * never appears here. */
export default function FunderHome({ myPools, loaded, ledger, farmerCount, onGoto, onCreatePool }) {
  const totalUnits = myPools.reduce((s, p) => s + unitsOf(p.balance), 0);
  const pausedCount = myPools.filter((p) => p.status === "Paused").length;
  const releasedUnits = ledger.reduce((s, r) => s + unitsOf(r.amount), 0);
  const poolById = Object.fromEntries(myPools.map((p) => [String(p.id), p]));

  // Newest events first; the feed shows the latest two events' releases.
  const byEvent = {};
  for (const r of ledger) (byEvent[String(r.event_id)] ??= []).push(r);
  const events = Object.entries(byEvent)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 28px 48px", maxWidth: 900, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      {/* hero — one number, one quiet line */}
      <div
        style={{
          background: "linear-gradient(160deg, var(--primary) 0%, var(--primary-hover) 100%)",
          borderRadius: 16,
          color: "#fff",
          padding: "26px 26px 22px",
          boxShadow: "var(--shadow-raised)",
        }}
      >
        <span style={{ font: "var(--text-label)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", color: "rgba(255,255,255,.75)" }}>
          Still escrowed
        </span>
        <div style={{ font: "var(--text-hero)", fontSize: 44, letterSpacing: "-0.02em", margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>
          {loaded ? phpValue(totalUnits) : "₱ —"}
        </div>
        <div style={{ font: "var(--text-fine)", color: "rgba(255,255,255,.78)", fontVariantNumeric: "tabular-nums" }}>
          {loaded
            ? `≈ ${totalUnits.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM · ${myPools.length} pool${myPools.length === 1 ? "" : "s"}${pausedCount ? ` (${pausedCount} paused)` : ""} · locked until a signed typhoon signal`
            : "reading your pools from Stellar Testnet…"}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <button onClick={onCreatePool} style={heroBtn}>＋ New Escrow Pool</button>
          <button onClick={() => onGoto("pools")} style={heroBtn}>↑ Withdraw unspent</button>
        </div>
      </div>

      {/* quick actions */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--container-highest)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          padding: "20px 18px",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.page}
            onClick={() => onGoto(a.page)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              color: "var(--text-dim)",
              font: "var(--text-fine)",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              minWidth: 92,
            }}
          >
            <span style={{ width: 54, height: 54, borderRadius: 18, background: "var(--container)", color: "var(--primary)", display: "grid", placeItems: "center" }}>
              {a.icon}
            </span>
            {a.label}
          </button>
        ))}
      </div>

      {loaded && (
        <DemoGuide pools={myPools} farmerCount={farmerCount} releases={ledger.length} onGoto={onGoto} onCreatePool={onCreatePool} />
      )}

      {/* recent releases, grouped by the event that caused them */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, margin: "0 4px 10px", flexWrap: "wrap" }}>
          <p style={{ margin: 0, font: "var(--text-label)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", color: "var(--text-faint)" }}>
            Recent releases — your money reaching farmers
          </p>
          {loaded && ledger.length > 0 && (
            <span style={{ font: "var(--text-label)", textTransform: "uppercase", color: "var(--ok-text)", fontVariantNumeric: "tabular-nums" }}>
              {phpValue(releasedUnits)} to date
            </span>
          )}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--container-highest)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          {!loaded && (
            <p style={{ margin: 0, padding: "22px 20px", font: "var(--text-fine)", color: "var(--text-faint)" }}>
              Reading on-chain state…
            </p>
          )}
          {loaded && events.length === 0 && (
            <p style={{ margin: 0, padding: "22px 20px", font: "var(--text-fine)", color: "var(--text-faint)" }}>
              No releases yet — they appear the moment a signed typhoon signal settles.
            </p>
          )}
          {loaded && events.map(([eventId, rows]) => (
            <div key={eventId}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "12px 20px",
                  background: "var(--surface-low)",
                  borderBottom: "1px solid var(--container-highest)",
                  font: "var(--text-fine)",
                  fontWeight: 700,
                  color: "var(--text-dim)",
                  flexWrap: "wrap",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5Z" />
                </svg>
                Signed event #{eventId}
                <span style={{ marginLeft: "auto", color: "var(--ok-text)", fontVariantNumeric: "tabular-nums" }}>
                  {rows.length} release{rows.length === 1 ? "" : "s"} · {phpValue(rows.reduce((s, r) => s + unitsOf(r.amount), 0))}
                </span>
              </div>
              {rows.map((r, i) => (
                <FeedRow key={`${eventId}-${i}`} row={r} pool={poolById[String(r.pool_id)]} />
              ))}
            </div>
          ))}
          {loaded && ledger.length > 0 && (
            <button
              onClick={() => onGoto("ledger")}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 20px",
                border: "none",
                borderTop: "1px solid var(--surface-low)",
                background: "none",
                color: "var(--primary)",
                font: "var(--text-fine)",
                fontWeight: 700,
                textAlign: "center",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              View all in Ledger →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const heroBtn = {
  background: "rgba(255,255,255,.16)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,.32)",
  borderRadius: 999,
  padding: "12px 22px",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
