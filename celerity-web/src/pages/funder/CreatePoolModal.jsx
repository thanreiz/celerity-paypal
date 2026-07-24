import React, { useState } from "react";
import Input from "../../design/Input";
import Select from "../../design/Select";
import Button from "../../design/Button";
import { invoke } from "../../lib/celerity";
import { toStroops } from "../../lib/config";
import { phpValue, usdValue, unitsFromUsd, unitsFromPhp, DEMO_USDPHP } from "../../lib/anchor";
import { mockInteractiveDeposit, sep24Chip, SEP24_LABEL } from "../../lib/sep24";
import { funderByRole } from "../../lib/funders";
import { setPoolName } from "../../lib/poolNames";
import { regionShort, REGION_OPTIONS } from "../../lib/regions";

export default function CreatePoolModal({ onClose, who, me, busy, run }) {
  const funder = funderByRole(who) || funderByRole("funder");
  const fiat = funder.currency === "PHP" ? "PHP" : "USD";

  const [name, setName] = useState("");
  const [region, setRegion] = useState(5);
  const [threshold, setThreshold] = useState(3);
  // Primary input is in the funder's fiat; converted to settlement units on submit.
  const [amountFiat, setAmountFiat] = useState(fiat === "PHP" ? 287.5 : 5);
  const [payoutFiat, setPayoutFiat] = useState(fiat === "PHP" ? 57.5 : 1);
  const [installments, setInstallments] = useState(1);
  const [period, setPeriod] = useState(60);
  const [sepStatus, setSepStatus] = useState(null);
  const [onramping, setOnramping] = useState(false);

  const amountUnits = fiat === "PHP" ? unitsFromPhp(amountFiat) : unitsFromUsd(amountFiat);
  const payoutUnits = fiat === "PHP" ? unitsFromPhp(payoutFiat) : unitsFromUsd(payoutFiat);

  const create = async () => {
    setOnramping(true);
    setSepStatus("incomplete");
    try {
      await mockInteractiveDeposit({
        amount: Number(amountFiat),
        fiatCurrency: fiat,
        onStatus: setSepStatus,
      });
      const poolId = await run("Create pool", () =>
        invoke(who, "deposit", {
          funder: me,
          amount: toStroops(amountUnits),
          region: Number(region),
          threshold: Number(threshold),
          payout: toStroops(payoutUnits),
          installments: Number(installments),
          claim_period_secs: BigInt(installments > 1 ? period : 0),
        })
      );
      if (poolId !== undefined && poolId !== null) setPoolName(poolId, name);
      onClose();
    } finally {
      setOnramping(false);
    }
  };

  const suffix = fiat;
  const amountHint =
    fiat === "USD"
      ? `${usdValue(amountUnits)} → ${phpValue(amountUnits)} · FX ${DEMO_USDPHP}`
      : `${phpValue(amountUnits)} → ${usdValue(amountUnits)} settlement · FX ${DEMO_USDPHP}`;
  const payoutHint =
    fiat === "USD"
      ? `${usdValue(payoutUnits)} → ${phpValue(payoutUnits)}`
      : `${phpValue(payoutUnits)} → ${usdValue(payoutUnits)} settlement`;

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
          background: "var(--surface)",
          width: "min(720px, 100%)",
          maxHeight: "88vh",
          borderRadius: "var(--radius-modal)",
          boxShadow: "var(--shadow-modal)",
          border: "1px solid var(--container-highest)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--container-highest)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, font: "var(--text-h2)", color: "var(--text)" }}>New Escrow Pool</h2>
            <p style={{ margin: "4px 0 0", font: "var(--text-meta)", color: "var(--text-faint)" }}>
              {funder.label} · deposit in {fiat} via SEP-24, then lock on-chain.
            </p>
          </div>
          <button onClick={onClose} className="cel-press" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "var(--text-faint)" }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24, overflowY: "auto", flex: 1, background: "var(--paper-inset)", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ margin: 0, font: "var(--text-body-lg)", color: "var(--primary)", paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)" }}>
              Purpose & Trigger
            </h3>
            <Input
              label="Pool name / purpose"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${regionShort(region)} Typhoon Relief`}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <Select label="Region" value={region} onChange={(e) => setRegion(e.target.value)} options={REGION_OPTIONS} />
              <Input label="Signal threshold" type="number" min="1" max="5" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
            <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)" }}>
              The name stays in this app — the contract stores only the pool number, region and rule.
            </p>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ margin: 0, font: "var(--text-body-lg)", color: "var(--primary)", paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)" }}>
              Financial Execution
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              <div>
                <Input
                  label={`Escrow amount (${fiat === "USD" ? usdValue(amountUnits) : phpValue(amountUnits)})`}
                  type="number"
                  min="0"
                  step="any"
                  value={amountFiat}
                  onChange={(e) => setAmountFiat(e.target.value)}
                  suffix={suffix}
                />
                <p style={{ margin: "6px 0 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>{amountHint}</p>
              </div>
              <div>
                <Input
                  label={`Payout / farmer (${fiat === "USD" ? usdValue(payoutUnits) : phpValue(payoutUnits)})`}
                  type="number"
                  min="0"
                  step="any"
                  value={payoutFiat}
                  onChange={(e) => setPayoutFiat(e.target.value)}
                  suffix={suffix}
                />
                <p style={{ margin: "6px 0 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>{payoutHint}</p>
              </div>
              <Input label="Installments" type="number" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
              {Number(installments) > 1 && (
                <Input label="Period (secs)" type="number" min="1" value={period} onChange={(e) => setPeriod(e.target.value)} />
              )}
            </div>
          </div>

          {(onramping || sepStatus) && (
            <div
              className="cel-pop"
              style={{
                background: "var(--surface)",
                border: "1.5px solid var(--primary)",
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ margin: 0, font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)" }}>
                  SEP-24 on-ramp
                </p>
                <p style={{ margin: "4px 0 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>{SEP24_LABEL}</p>
              </div>
              <span
                style={{
                  font: "var(--text-fine)",
                  fontWeight: 800,
                  color: "var(--on-primary)",
                  background: "var(--primary)",
                  borderRadius: "var(--radius-chip)",
                  padding: "6px 12px",
                }}
              >
                {sep24Chip(sepStatus)}
              </span>
            </div>
          )}
        </div>

        <div style={{ padding: 24, borderTop: "1px solid var(--container-highest)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-line)", borderRadius: 12, padding: 16 }}>
            <p style={{ margin: 0, font: "var(--text-body)", color: "var(--ok-text)" }}>
              <strong>When</strong> typhoon signal ≥ {threshold} hits {regionShort(region)} <strong>→ release</strong>{" "}
              {phpValue(payoutUnits)}
              {Number(installments) > 1 ? ` ×${installments}` : ""} per registered farmer.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="outline" onClick={onClose} disabled={busy || onramping}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={busy || onramping}>
              {onramping ? "On-ramping…" : "Create & Fund Pool"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
