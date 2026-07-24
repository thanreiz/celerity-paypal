import React, { useState } from "react";
import Input from "../../design/Input";
import Button from "../../design/Button";
import { invoke } from "../../lib/celerity";
import { toStroops, fmtUnits } from "../../lib/config";
import { phpValue, usdValue, unitsFromUsd, unitsFromPhp, DEMO_USDPHP } from "../../lib/anchor";
import { mockInteractiveDeposit, sep24Chip, SEP24_LABEL } from "../../lib/sep24";
import { funderByRole } from "../../lib/funders";
import { poolName } from "../../lib/poolNames";
import { regionName } from "../../lib/regions";

const unitsOf = (stroops) => Number(BigInt(stroops)) / 1e7;

// Quick-add chips in the funder's primary fiat.
const QUICK_ADD_USD = [1, 5, 10, 50];
const QUICK_ADD_PHP = [50, 250, 500, 2500];

/**
 * Top-up a single escrow pool. Amount is entered in the funder's fiat
 * (ADB = USD, PCIC = PHP), converted to settlement units, then SEP-24 mock
 * on-ramp runs before the real on-chain top_up.
 */
export default function TopUpModal({ pool, who, busy, run, onClose }) {
  const funder = funderByRole(who) || funderByRole("funder");
  const fiat = funder.currency === "PHP" ? "PHP" : "USD";
  const quick = fiat === "PHP" ? QUICK_ADD_PHP : QUICK_ADD_USD;

  const [amountFiat, setAmountFiat] = useState("");
  const [sepStatus, setSepStatus] = useState(null);
  const [onramping, setOnramping] = useState(false);

  const fiatNum = Number(amountFiat);
  const valid = Number.isFinite(fiatNum) && fiatNum > 0;
  const units = fiat === "PHP" ? unitsFromPhp(fiatNum) : unitsFromUsd(fiatNum);

  const add = (n) => {
    const next = (Number.isFinite(fiatNum) ? fiatNum : 0) + n;
    setAmountFiat(String(Number(next.toFixed(2))));
  };

  const submit = async () => {
    if (!valid) return;
    setOnramping(true);
    setSepStatus("incomplete");
    try {
      await mockInteractiveDeposit({
        amount: fiatNum,
        fiatCurrency: fiat,
        onStatus: setSepStatus,
      });
      await run("Top up", () => invoke(who, "top_up", { pool_id: pool.id, amount: toStroops(units) }));
      onClose();
    } finally {
      setOnramping(false);
    }
  };

  const balUnits = unitsOf(pool.balance);

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
              {poolName(pool)} · {funder.label} · {fiat} via SEP-24
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
              {phpValue(balUnits)} · {usdValue(balUnits)} · {fmtUnits(pool.balance)} units
            </span>
          </div>

          <div>
            <Input
              label={`Amount to add (${fiat})`}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={amountFiat}
              onChange={(e) => setAmountFiat(e.target.value)}
              placeholder={fiat === "PHP" ? "e.g. 575" : "e.g. 10"}
              suffix={fiat}
              autoFocus
            />
            <div style={{ marginTop: 8, font: "var(--text-body-lg)", fontWeight: 700, color: valid ? "var(--primary)" : "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
              {valid
                ? fiat === "USD"
                  ? `${usdValue(units)} → ${phpValue(units)} · FX ${DEMO_USDPHP}`
                  : `${phpValue(units)} → ${usdValue(units)} settlement · FX ${DEMO_USDPHP}`
                : "Type or add an amount"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {quick.map((n) => (
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
                +{fiat === "PHP" ? `₱${n}` : `$${n}`}
              </button>
            ))}
          </div>

          {(onramping || sepStatus) && (
            <div style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: 12, padding: 14 }}>
              <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)" }}>{SEP24_LABEL}</p>
              <p style={{ margin: "6px 0 0", font: "var(--text-body)", fontWeight: 700, color: "var(--primary)" }}>
                On-ramp: {sep24Chip(sepStatus)}
              </p>
            </div>
          )}
        </div>

        <div style={{ padding: 20, borderTop: "1px solid var(--container-highest)", display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Button variant="outline" onClick={onClose} disabled={busy || onramping}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || onramping || !valid}>
            {onramping ? "On-ramping…" : valid ? `Top up ${phpValue(units)}` : "Top up"}
          </Button>
        </div>
      </div>
    </div>
  );
}
