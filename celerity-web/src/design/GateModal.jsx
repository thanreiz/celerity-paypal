import React, { useEffect, useRef, useState } from "react";
import Button from "./Button";

/**
 * Stage PIN modal — unlocks /api/invoke and /api/oracle-sign for the session.
 * PIN is never persisted beyond sessionStorage (see lib/gate.js).
 */
export default function GateModal({ open, onSubmit, onCancel }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setBusy(false);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!pin.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(pin.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Demo PIN"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(26, 28, 26, 0.45)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "var(--font-sans)",
      }}
    >
      <form
        onSubmit={submit}
        className="cel-pop"
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--surface)",
          borderRadius: "var(--radius-modal)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-modal)",
          padding: "24px 22px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <img src="/logo-dove.png" alt="" style={{ width: 36, height: 36, alignSelf: "center" }} />
        <h2 style={{ margin: 0, font: "var(--text-h2)", fontSize: 18, textAlign: "center", color: "var(--text)" }}>
          Stage unlock
        </h2>
        <p style={{ margin: 0, font: "var(--text-meta)", color: "var(--text-dim)", textAlign: "center" }}>
          Enter the demo PIN to sign on-chain actions. Keys stay on the server — this PIN is session-only.
        </p>
        <input
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Demo PIN"
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: "1.5px solid var(--container-highest)",
            borderRadius: "var(--radius-input)",
            padding: "12px 14px",
            font: "var(--text-body)",
            fontFamily: "var(--font-sans)",
          }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={busy || !pin.trim()}>
            {busy ? "Unlocking…" : "Unlock"}
          </Button>
        </div>
      </form>
    </div>
  );
}
