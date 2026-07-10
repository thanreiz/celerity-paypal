import React from "react";

/** Amber "stub" badge — marks every simulated/demo boundary (oracle signer,
 * SEP-31 anchor rate) so it's never mistaken for working infrastructure. */
export default function Badge({ stub = false, children, style }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-sans)",
        font: "var(--text-fine)",
        fontWeight: 700,
        padding: "4px 12px",
        borderRadius: "var(--radius-chip)",
        border: "1px solid var(--warn-line)",
        color: "var(--warn-text)",
        background: "var(--warn-bg)",
        textTransform: stub ? "uppercase" : "none",
        letterSpacing: stub ? "var(--tracking-label)" : "normal",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
