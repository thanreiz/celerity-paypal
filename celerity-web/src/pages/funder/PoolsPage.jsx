import React, { useState } from "react";
import StatusPill from "../../design/StatusPill";
import Button from "../../design/Button";
import RuleSentence from "../../design/RuleSentence";
import { invoke } from "../../lib/celerity";
import { fmtUnits, short, toStroops, CONTRACT_ID } from "../../lib/config";
import { phpValue } from "../../lib/anchor";
import { FUNDERS } from "../../lib/funders";
import { poolName } from "../../lib/poolNames";
import { regionName, regionShort, ISLANDS } from "../../lib/regions";

const unitsOf = (stroops) => Number(BigInt(stroops)) / 1e7;

/** Display status: the chain says "Active", the design language says "Armed";
 * a pool whose region settled under the loaded bulletin reads "Released". */
function displayStatus(pool, bulletin) {
  if (pool.status === "Active" && bulletin?.settled?.includes(Number(pool.region))) return "Released";
  return pool.status === "Active" ? "Armed" : pool.status;
}

function poolAffected(pool, bulletin) {
  if (!bulletin) return false;
  return Number(bulletin.signals[pool.region]) >= Number(pool.signal_threshold);
}

const MIX_COLORS = {
  Armed: { bg: "var(--ok-bg)", text: "var(--ok-text)", line: "var(--ok-line)" },
  Released: { bg: "var(--primary-chip)", text: "#fff", line: "var(--primary-chip)" },
  Paused: { bg: "var(--warn-bg)", text: "var(--warn-text)", line: "var(--warn-line)" },
  Exhausted: { bg: "var(--bad-bg)", text: "var(--bad-text)", line: "var(--bad-line)" },
};

function PoolCard({ pool, history, bulletin, who, busy, run, onGoto }) {
  const st = displayStatus(pool, bulletin);
  const aff = poolAffected(pool, bulletin);
  const paused = pool.status === "Paused";

  return (
    <article
      style={{
        background: paused ? "var(--surface-low)" : "var(--surface)",
        border: `1px ${paused ? "dashed" : "solid"} ${aff ? "var(--warn-line)" : "var(--container-highest)"}`,
        ...(aff ? { borderWidth: 1.5, boxShadow: "0 4px 20px rgba(180, 83, 9, .10)" } : { boxShadow: "var(--shadow-card)" }),
        borderRadius: "var(--radius-card)",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: pool.status === "Exhausted" ? 0.85 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, font: "var(--text-h2)", fontSize: 17, color: paused ? "var(--text-dim)" : "var(--text)" }}>
            {poolName(pool)}
          </h3>
          <p style={{ margin: "3px 0 0", font: "var(--text-fine)", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
            Pool #{String(pool.id)} · {regionName(pool.region)}
            {aff && (
              <span
                style={{
                  marginLeft: 8,
                  display: "inline-flex",
                  font: "var(--text-label)",
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: "var(--tracking-label)",
                  color: "var(--warn-text)",
                  background: "var(--warn-bg)",
                  border: "1px solid var(--warn-line)",
                  borderRadius: 999,
                  padding: "2px 9px",
                }}
              >
                in typhoon path
              </span>
            )}
          </p>
        </div>
        <StatusPill status={st} />
      </div>

      <div style={{ opacity: paused ? 0.75 : 1 }}>
        <RuleSentence
          condition={`typhoon signal ≥ ${pool.signal_threshold} hits ${regionShort(pool.region)}`}
          amount={`${phpValue(unitsOf(pool.payout_per_farmer))}${pool.installments > 1 ? ` ×${pool.installments}` : ""}`}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "flex-end",
          gap: 26,
          paddingTop: 11,
          borderTop: "1px solid var(--container-highest)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontVariantNumeric: "tabular-nums" }}>
          <p style={{ margin: 0, font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>Escrowed</p>
          <div style={{ font: "var(--text-money)", fontSize: 21, color: paused ? "var(--text-dim)" : "var(--primary)" }}>
            {phpValue(unitsOf(pool.balance))}
          </div>
          <div style={{ font: "var(--text-fine)", fontSize: 12, color: "var(--text-faint)" }}>≈ {fmtUnits(pool.balance)} XLM</div>
        </div>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>
          <p style={{ margin: 0, font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>Released so far</p>
          {history.count > 0 ? (
            <>
              <div style={{ font: "var(--text-money)", fontSize: 21, color: "var(--ok-text)" }}>{phpValue(history.units)}</div>
              <div style={{ font: "var(--text-fine)", fontSize: 12, color: "var(--text-faint)" }}>
                {history.count} release{history.count === 1 ? "" : "s"} · {history.farmers} farmer{history.farmers === 1 ? "" : "s"} ·{" "}
                <button
                  onClick={() => onGoto("ledger")}
                  style={{
                    border: "none",
                    background: "none",
                    color: "var(--primary)",
                    fontWeight: 700,
                    fontSize: 12,
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  view →
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ font: "var(--text-money)", fontSize: 21, color: "var(--text-faint)", fontWeight: 600 }}>—</div>
              <div style={{ font: "var(--text-fine)", fontSize: 12, color: "var(--text-faint)" }}>no releases yet</div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Top up", () => invoke(who, "top_up", { pool_id: pool.id, amount: toStroops(1) }))}>
            Top-up
          </Button>
          {paused ? (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => run("Resume", () => invoke(who, "resume_pool", { pool_id: pool.id }))}>
              Resume
            </Button>
          ) : (
            <Button size="sm" variant="default" disabled={busy} onClick={() => run("Pause", () => invoke(who, "pause_pool", { pool_id: pool.id }))}>
              Pause
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("Withdraw unspent", () => invoke(who, "withdraw_unspent", { pool_id: pool.id }))}>
            Withdraw
          </Button>
        </div>
      </div>
    </article>
  );
}

function SummaryStat({ label, value, sub, tone }) {
  const bad = tone === "bad";
  return (
    <div
      style={{
        background: bad ? "var(--bad-bg)" : "var(--surface)",
        border: `1px solid ${bad ? "var(--bad-line)" : "var(--container-highest)"}`,
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "18px 20px",
      }}
    >
      <p style={{ margin: 0, font: "var(--text-label)", color: bad ? "var(--bad-text)" : "var(--text-faint)", textTransform: "uppercase" }}>{label}</p>
      <p
        style={{
          margin: "6px 0 0",
          font: "var(--text-display)",
          fontSize: 28,
          color: bad ? "var(--bad-text)" : tone === "ok" ? "var(--ok-text)" : "var(--primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
      {sub && <p style={{ margin: "3px 0 0", font: "var(--text-fine)", color: bad ? "var(--bad-text)" : "var(--text-faint)" }}>{sub}</p>}
    </div>
  );
}

function IslandGroup({ island, pools, bulletin, children }) {
  const [open, setOpen] = useState(true);
  const totalUnits = pools.reduce((s, p) => s + unitsOf(p.balance), 0);
  const mix = {};
  for (const p of pools) {
    const s = displayStatus(p, bulletin);
    mix[s] = (mix[s] || 0) + 1;
  }
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "13px 18px",
          background: "var(--surface)",
          border: "1px solid var(--container-highest)",
          borderRadius: 14,
          boxShadow: "var(--shadow-card)",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          boxSizing: "border-box",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-faint)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform var(--transition-fast)" }}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        <h3 style={{ margin: 0, font: "var(--text-body-lg)", fontSize: 15, color: "var(--primary-chip)" }}>{island}</h3>
        <span style={{ font: "var(--text-fine)", fontSize: 12, color: "var(--text-faint)", fontWeight: 700 }}>
          {pools.length} pool{pools.length === 1 ? "" : "s"}
        </span>
        {Object.entries(mix).map(([s, n]) => {
          const c = MIX_COLORS[s] ?? MIX_COLORS.Armed;
          return (
            <span
              key={s}
              style={{
                font: "var(--text-label)",
                fontSize: 10.5,
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-label)",
                background: c.bg,
                color: c.text,
                border: `1px solid ${c.line}`,
                borderRadius: 999,
                padding: "2px 9px",
              }}
            >
              {n} {s.toLowerCase()}
            </span>
          );
        })}
        <span style={{ marginLeft: "auto", font: "var(--text-fine)", fontWeight: 700, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
          {phpValue(totalUnits)}
        </span>
      </button>
      {open && <div style={{ padding: "14px 2px 4px", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>}
    </div>
  );
}

/** Escrow pools dashboard — strictly the logged-in funder's pools, grouped by
 * island, with a typhoon-context banner on top. Whatever renders for ADB
 * renders for PCIC: it's one code path over `myPools`. */
export default function PoolsPage({ myPools, loaded, ledger, bulletin, who, me, busy, run, onCreatePool, onSwitchWho, onGoto }) {
  const totalUnits = myPools.reduce((s, p) => s + unitsOf(p.balance), 0);
  const active = myPools.filter((p) => p.status === "Active").length;
  const exhausted = myPools.filter((p) => p.status === "Exhausted").length;
  const releasedUnits = ledger.reduce((s, r) => s + unitsOf(r.amount), 0);

  // Per-pool release history, from this funder's own on-chain ledger.
  const historyFor = (pool) => {
    const rows = ledger.filter((r) => String(r.pool_id) === String(pool.id));
    return {
      count: rows.length,
      units: rows.reduce((s, r) => s + unitsOf(r.amount), 0),
      farmers: new Set(rows.map((r) => r.farmer)).size,
    };
  };

  // Last settled event (for the calm banner) — highest event id in my ledger.
  const lastEvent = (() => {
    if (!ledger.length) return null;
    const maxId = ledger.reduce((m, r) => (Number(r.event_id) > Number(m) ? r.event_id : m), ledger[0].event_id);
    const rows = ledger.filter((r) => String(r.event_id) === String(maxId));
    return {
      id: maxId,
      units: rows.reduce((s, r) => s + unitsOf(r.amount), 0),
      pools: new Set(rows.map((r) => String(r.pool_id))).size,
      farmers: new Set(rows.map((r) => r.farmer)).size,
    };
  })();

  const affectedCount = myPools.filter((p) => poolAffected(p, bulletin)).length;

  // Island groups; regions outside the named map land in "Other regions".
  const groups = [...Object.keys(ISLANDS), "Other regions"]
    .map((island) => ({
      island,
      pools: myPools
        .filter((p) =>
          island === "Other regions"
            ? !Object.values(ISLANDS).flat().includes(Number(p.region))
            : ISLANDS[island].includes(Number(p.region))
        )
        .sort((a, b) => Number(a.region) - Number(b.region) || Number(a.id) - Number(b.id)),
    }))
    .filter((g) => g.pools.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 28px 48px", maxWidth: 1120, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      {/* net row + acting-as switcher — live proof of funder isolation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ font: "var(--text-fine)", color: "var(--text-faint)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          Stellar Testnet ·{" "}
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--primary)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            contract {short(CONTRACT_ID)} ↗
          </a>{" "}
          · everything on-chain is live
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: "var(--text-fine)", color: "var(--text-faint)", fontWeight: 700 }}>Acting as</span>
          {FUNDERS.map((f) => (
            <button
              key={f.role}
              onClick={() => onSwitchWho(f.role)}
              style={{
                border: "1px solid var(--container-highest)",
                background: who === f.role ? "var(--primary-chip)" : "var(--surface)",
                color: who === f.role ? "var(--on-primary-chip)" : "var(--text-dim)",
                borderRadius: 999,
                padding: "8px 16px",
                font: "var(--text-fine)",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* typhoon context banner — temporary conditions over permanent structure */}
      {bulletin ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "15px 20px",
            borderRadius: 16,
            background: "var(--warn-bg)",
            border: "1.5px solid var(--warn-line)",
            color: "var(--warn-text)",
            font: "var(--text-fine)",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4m0 3h.01" />
          </svg>
          <div>
            Typhoon {bulletin.name} · {affectedCount} of your pools in its path
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, opacity: 0.85, marginTop: 1 }}>
              bulletin issued {bulletin.issued || "—"} · a temporary overlay — your island grouping below is permanent
            </span>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "15px 20px",
            borderRadius: 16,
            background: "var(--ok-bg)",
            border: "1px solid var(--ok-line)",
            color: "var(--ok-text)",
            font: "var(--text-fine)",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 3 4.5 6v5c0 4.6 3.2 8.4 7.5 10 4.3-1.6 7.5-5.4 7.5-10V6L12 3Z" /><path d="m9 12 2 2 4-4.5" />
          </svg>
          <div>
            No active typhoon — your pools are armed and waiting.
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, opacity: 0.85, marginTop: 1 }}>
              Load a bulletin on the Trigger Typhoon screen and this dashboard reflects it.
            </span>
            {lastEvent && (
              <span style={{ display: "block", fontSize: 12, fontWeight: 600, opacity: 0.85 }}>
                Last event: #{String(lastEvent.id)} — {phpValue(lastEvent.units)} across {lastEvent.pools} pool{lastEvent.pools === 1 ? "" : "s"} to{" "}
                {lastEvent.farmers} farmer{lastEvent.farmers === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* summary strip — released-to-date on the happy path, exhausted alert only when real */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <SummaryStat label="Total escrowed" value={phpValue(totalUnits)} sub={`≈ ${totalUnits.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM`} />
        <SummaryStat label="Active pools" value={active} sub={`of ${myPools.length} deployed`} />
        {exhausted > 0 ? (
          <SummaryStat label="Exhausted pools" value={exhausted} sub="need a top-up" tone="bad" />
        ) : (
          <SummaryStat
            label="Released to date"
            value={phpValue(releasedUnits)}
            sub={`${ledger.length} release${ledger.length === 1 ? "" : "s"} · all on-chain`}
            tone="ok"
          />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primary" onClick={onCreatePool}>+ New Escrow Pool</Button>
      </div>

      {groups.map((g) => (
        <IslandGroup key={g.island} island={g.island} pools={g.pools} bulletin={bulletin}>
          {g.pools.map((p) => (
            <PoolCard key={String(p.id)} pool={p} history={historyFor(p)} bulletin={bulletin} who={who} busy={busy} run={run} onGoto={onGoto} />
          ))}
        </IslandGroup>
      ))}
      {!loaded && myPools.length === 0 && (
        <p style={{ font: "var(--text-body)", color: "var(--text-faint)" }}>Reading pools from Stellar Testnet…</p>
      )}
      {loaded && myPools.length === 0 && (
        <p style={{ font: "var(--text-body)", color: "var(--text-faint)" }}>
          No pools yet under this identity — create the first one above.
        </p>
      )}
    </div>
  );
}
