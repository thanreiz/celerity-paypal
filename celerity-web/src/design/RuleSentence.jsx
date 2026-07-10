import React from "react";

/** Renders a pool's release condition as a plain-language sentence with a
 * green left rule — never a spec/JSON dump. The brand's signature "readable
 * smart contract" moment. */
export default function RuleSentence({ condition, amount, recipients = "registered farmers" }) {
  return (
    <div
      style={{
        background: "var(--surface-low)",
        border: "1px solid var(--container-highest)",
        borderRadius: 8,
        padding: 16,
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "var(--primary)" }} />
      <p style={{ margin: "0 0 0 8px", font: "var(--text-body)", color: "var(--text-dim)" }}>
        <strong style={{ color: "var(--text)" }}>When</strong> {condition}
        <span style={{ color: "var(--primary)", margin: "0 6px" }}>→</span>
        <strong style={{ color: "var(--text)" }}>release</strong>{" "}
        <strong style={{ color: "var(--primary)", fontVariantNumeric: "tabular-nums" }}>{amount}</strong> to {recipients}.
      </p>
    </div>
  );
}
