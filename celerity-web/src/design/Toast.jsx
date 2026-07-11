import React from "react";

/** Fixed-position toast — white card, thick colored left edge. Success
 * (green, auto-dismiss 5s) vs error (red-tinted surface, 12s — readable
 * from the back row). Errors are human sentences, never raw dumps. */
export default function Toast({ message, error = false }) {
  return (
    <div
      className="cel-toast"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: error ? "var(--bad-bg)" : "var(--surface)",
        border: `1px solid ${error ? "var(--bad-line)" : "var(--ok-line)"}`,
        borderLeft: `6px solid ${error ? "var(--bad-text)" : "var(--ok-text)"}`,
        color: error ? "var(--bad-text)" : "var(--text)",
        padding: "14px 24px",
        borderRadius: 14,
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        fontSize: 17,
        boxShadow: "var(--shadow-modal)",
        maxWidth: "90vw",
        zIndex: 100,
      }}
    >
      {message}
    </div>
  );
}
