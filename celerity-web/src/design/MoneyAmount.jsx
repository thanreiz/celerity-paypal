import React from "react";

/** Dual-currency money display — PHP is always primary (bold, brand green
 * for hero contexts), USD/unit equivalent renders smaller/secondary beside
 * it. Non-negotiable per brand voice: funder-side money always shows both. */
export default function MoneyAmount({ php, usd, size = "md", tone = "primary" }) {
  const sizes = {
    hero: { php: "var(--text-hero)", usd: "var(--text-meta)" },
    lg: { php: "var(--text-display)", usd: "var(--text-meta)" },
    md: { php: "var(--text-money)", usd: "var(--text-fine)" },
  };
  const s = sizes[size] || sizes.md;
  const color = tone === "primary" ? "var(--primary)" : "var(--text)";
  return (
    <div style={{ fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>
      <div style={{ font: s.php, color }}>{php}</div>
      {usd && <div style={{ font: s.usd, color: "var(--text-faint)" }}>{usd}</div>}
    </div>
  );
}
