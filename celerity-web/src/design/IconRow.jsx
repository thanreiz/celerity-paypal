import React from "react";

/** White rounded card pairing a small icon-in-circle with a title, one-line
 * description, and optional trailing content (amount, action button). The
 * farmer app's list pattern for installments/receipts/status. */
export default function IconRow({ icon, title, subtitle, trailing, tone = "soft" }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--container-highest)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          flexShrink: 0,
          background: tone === "accent" ? "var(--accent-soft)" : "rgba(22,69,45,0.1)",
          color: tone === "accent" ? "var(--accent)" : "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--text-table)", fontWeight: 700, color: "var(--text)" }}>{title}</div>
        {subtitle && (
          <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {trailing && <div style={{ flexShrink: 0, textAlign: "right" }}>{trailing}</div>}
    </div>
  );
}
