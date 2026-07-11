import React, { useState } from "react";
import Input from "../../design/Input";
import Select from "../../design/Select";
import Button from "../../design/Button";
import { invoke } from "../../lib/celerity";
import { toStroops } from "../../lib/config";
import { phpValue } from "../../lib/anchor";
import { setPoolName } from "../../lib/poolNames";
import { regionShort, REGION_OPTIONS } from "../../lib/regions";

export default function CreatePoolModal({ onClose, who, me, busy, run }) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState(5);
  const [threshold, setThreshold] = useState(3);
  const [amount, setAmount] = useState(5);
  const [payout, setPayout] = useState(1);
  const [installments, setInstallments] = useState(1);
  const [period, setPeriod] = useState(60);

  const create = async () => {
    const poolId = await run("Create pool", () =>
      invoke(who, "deposit", {
        funder: me,
        amount: toStroops(amount),
        region: Number(region),
        threshold: Number(threshold),
        payout: toStroops(payout),
        installments: Number(installments),
        claim_period_secs: BigInt(installments > 1 ? period : 0),
      })
    );
    // The name/purpose is an app-level label — the contract only knows numbers.
    if (poolId !== undefined && poolId !== null) setPoolName(poolId, name);
    onClose();
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
              Deposit — money locks now, moves only on a signed signal.
            </p>
          </div>
          <button onClick={onClose} className="cel-press" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "var(--text-faint)" }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24, overflowY: "auto", flex: 1, background: "var(--paper-inset)", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ margin: 0, font: "var(--text-body-lg)", color: "var(--primary)", paddingBottom: 8, borderBottom: "1px solid var(--container-highest)" }}>
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

          <div style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ margin: 0, font: "var(--text-body-lg)", color: "var(--primary)", paddingBottom: 8, borderBottom: "1px solid var(--container-highest)" }}>
              Financial Execution
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              <Input label={`Escrow amount (${phpValue(amount)})`} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} suffix="XLM" />
              <Input label={`Payout / farmer (${phpValue(payout)})`} type="number" min="0" value={payout} onChange={(e) => setPayout(e.target.value)} suffix="XLM" />
              <Input label="Installments" type="number" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
              {Number(installments) > 1 && (
                <Input label="Period (secs)" type="number" min="1" value={period} onChange={(e) => setPeriod(e.target.value)} />
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: 24, borderTop: "1px solid var(--container-highest)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-line)", borderRadius: 12, padding: 16 }}>
            <p style={{ margin: 0, font: "var(--text-body)", color: "var(--ok-text)" }}>
              <strong>When</strong> typhoon signal ≥ {threshold} hits {regionShort(region)} <strong>→ release</strong>{" "}
              {phpValue(payout)}
              {Number(installments) > 1 ? ` ×${installments}` : ""} per registered farmer.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={busy}>Create & Fund Pool</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
