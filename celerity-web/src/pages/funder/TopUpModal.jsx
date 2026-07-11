import React, { useState } from "react";
import Input from "../../design/Input";
import Button from "../../design/Button";
import { invoke } from "../../lib/celerity";
import { toStroops, fmtUnits } from "../../lib/config";
import { phpValue } from "../../lib/anchor";
import { poolName } from "../../lib/poolNames";
import { regionName } from "../../lib/regions";

const unitsOf = (stroops) => Number(BigInt(stroops)) / 1e7;

// Quick-add chips so a funder can build a big amount in a couple of taps
// instead of ten — but the amount field is the source of truth, editable
// directly.
const QUICK_ADD = [1, 5, 10, 50];

/**
 * Top-up a single escrow pool by any amount the funder types. The contract's
 * top_up already accepts any amount > 0 (see lib.rs) — this replaces the old
 * fixed +1 XLM button so nobody has to press it ten times. Amount is entered
 * in XLM with a live peso preview; on confirm it converts to stroops and
 * signs as the pool's funder.
 */
export default function TopUpModal({ pool, who, busy, run, onClose }) {
  const [amount, setAmount] = useState("");

  const units = Number(amount);
  const valid = Number.isFinite(units) && units > 0;

  const add = (n) => {
    const next = (Number.isFinite(units) ? units : 0) + n;
    // Trim floating dust so "1 + 5" reads "6", not "6.0000001".
    setAmount(String(Number(next.toFixed(7))));
  };

  const submit = () => {
    if (!valid) return;
    run("Top up", () => invoke(who, "top_up", { pool_id: pool.id, amount: toStroops(units) })).then(onClose);
  };

  return (
    <div
      className="cel-fadein"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,28,26,0.32)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        fontFamily: "var(--font-sans)",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cel-overlay"
        style={{
          background: "#fff",
          width: "min(440px, 100%)",
          borderRadius: "var(--radius-modal)",
          boxShadow: "var(--shadow-modal)",
          border: "1px solid var(--container-highest)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "22px 24px", borderBottom: "1px solid var(--container-highest)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, font: "var(--text-h2)", color: "var(--text)" }}>Top up pool</h2>
            <p style={{ margin: "4px 0 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>
              {poolName(pool)} · Pool #{String(pool.id)} · {regionName(pool.region)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="cel-press" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "var(--text-faint)" }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24, background: "var(--paper-inset)", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", font: "var(--text-fine)", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ fontWeight: 700 }}>Current balance</span>
            <span style={{ color: "var(--text-dim)", fontWeight: 700 }}>
              {phpValue(unitsOf(pool.balance))} · {fmtUnits(pool.balance)} XLM
            </span>
          </div>

          <div>
            <Input
              label="Amount to add"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10"
              suffix="XLM"
              autoFocus
            />
            <div style={{ marginTop: 8, font: "var(--text-body-lg)", fontWeight: 700, color: valid ? "var(--primary)" : "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
              {valid ? `≈ ${phpValue(units)}` : "Type or add an amount"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {QUICK_ADD.map((n) => (
              <button
                key={n}
                onClick={() => add(n)}
                className="cel-press"
                style={{
                  flex: "1 1 0",
                  minWidth: 68,
                  border: "1px solid var(--container-highest)",
                  background: "var(--surface)",
                  color: "var(--primary)",
                  borderRadius: 999,
                  padding: "9px 12px",
                  font: "var(--text-fine)",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  whiteSpace: "nowrap",
                }}
              >
                +{n} XLM
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: 20, borderTop: "1px solid var(--container-highest)", display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !valid}>
            {valid ? `Top up ${phpValue(units)}` : "Top up"}
          </Button>
        </div>
      </div>
    </div>
  );
}
