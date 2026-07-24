import React from "react";

const MAP = {
  Active: { bg: "var(--ok-bg)", text: "var(--ok-text)", line: "var(--ok-line)" },
  Armed: { bg: "var(--ok-bg)", text: "var(--ok-text)", line: "var(--ok-line)" },
  Registered: { bg: "var(--ok-bg)", text: "var(--ok-text)", line: "var(--ok-line)" },
  Paused: { bg: "var(--warn-bg)", text: "var(--warn-text)", line: "var(--warn-line)" },
  Exhausted: { bg: "var(--bad-bg)", text: "var(--bad-text)", line: "var(--bad-line)" },
  Released: { bg: "var(--neutral-bg)", text: "var(--neutral-text)", line: "var(--neutral-line)" },
  Done: { bg: "var(--neutral-bg)", text: "var(--neutral-text)", line: "var(--neutral-line)" },
};

/** Status pill — dot + label, never color-only. Exact hexes from the Stitch
 * screens: green = Armed/Active/Registered, gray = Released/Done, amber =
 * Paused, red = Exhausted/error. */
export default function StatusPill({ status }) {
  const c = MAP[status] || MAP.Released;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 12px",
        borderRadius: "var(--radius-chip)",
        font: "var(--text-fine)",
        fontWeight: 700,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.line}`,
        fontFamily: "var(--font-sans)",
        whiteSpace: "nowrap",
      }}
    >
      <span className={status === "Active" || status === "Armed" ? "cel-pulse" : undefined} style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
      {status}
    </span>
  );
}
