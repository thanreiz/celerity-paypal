import React from "react";

const OK = { bg: "var(--ok-bg)", text: "var(--ok-text)", line: "var(--ok-line)" };
const WARN = { bg: "var(--warn-bg)", text: "var(--warn-text)", line: "var(--warn-line)" };
const BAD = { bg: "var(--bad-bg)", text: "var(--bad-text)", line: "var(--bad-line)" };
const NEUTRAL = { bg: "var(--neutral-bg)", text: "var(--neutral-text)", line: "var(--neutral-line)" };

// Keys are upper-cased so run states ("awaiting_approval") and PayPal
// states ("SUCCESS", "UNCLAIMED") share one map.
const MAP = {
  ACTIVE: [OK, "Active"],
  SUCCESS: [OK, "Delivered"],
  APPROVED: [OK, "Approved"],
  AWAITING_APPROVAL: [WARN, "Needs approval"],
  RUNNING: [WARN, "Agent working"],
  PENDING: [WARN, "Pending"],
  PROCESSING: [WARN, "Processing"],
  UNCLAIMED: [WARN, "Unclaimed"],
  ONHOLD: [WARN, "On hold"],
  SUSPENDED: [WARN, "Suspended"],
  NO_ACTION: [NEUTRAL, "No action"],
  REJECTED: [NEUTRAL, "Rejected"],
  CANCELED: [NEUTRAL, "Canceled"],
  FAILED: [BAD, "Failed"],
  DENIED: [BAD, "Denied"],
  BLOCKED: [BAD, "Blocked"],
  RETURNED: [BAD, "Returned"],
  REFUNDED: [BAD, "Refunded"],
  REVERSED: [BAD, "Reversed"],
};

const LIVE = new Set(["RUNNING", "PENDING", "PROCESSING"]);

/** Status pill — dot + label, never color-only. Green = done, amber = waiting
 * on someone, red = money did not arrive, gray = closed without payment. */
export default function StatusPill({ status, label }) {
  const key = String(status || "").toUpperCase();
  const [c, text] = MAP[key] || [NEUTRAL, status];
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
      <span
        className={LIVE.has(key) ? "cel-pulse" : undefined}
        style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", flexShrink: 0 }}
      />
      {label || text}
    </span>
  );
}
