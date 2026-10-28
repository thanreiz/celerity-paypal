import React, { useState } from "react";
import Button from "../../design/Button";
import Input from "../../design/Input";

export default function LoginScreen({ onSignIn }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("celerity.coordinatorName") || "";
    } catch {
      return "";
    }
  });
  const [key, setKey] = useState("");

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px var(--space-page-x)",
        background: "var(--halo-soft), var(--paper-page)",
      }}
    >
      <form
        className="cel-pop"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) onSignIn(key.trim(), name.trim() || "Coordinator");
        }}
        style={{
          width: "min(100%, 400px)",
          background: "var(--surface)",
          border: "1px solid var(--container-highest)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <img src="/logo-lockup.png" alt="Celerity" style={{ height: 40, objectFit: "contain", alignSelf: "flex-start" }} />
        <div>
          <h1 style={{ font: "var(--text-h1)", margin: 0 }}>Coordinator sign-in</h1>
          <p style={{ font: "var(--text-meta)", color: "var(--text-dim)", margin: "6px 0 0" }}>
            Coordinators review what the relief agent drafts and approve every payout before PayPal sends it.
          </p>
        </div>
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ana, MDRRMO Virac" autoComplete="name" />
        <Input label="Coordinator key" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" />
        <Button type="submit" variant="outline" disabled={!key.trim()}>
          Sign in
        </Button>
        <a href="#/public" style={{ font: "var(--text-fine)", color: "var(--primary)", textAlign: "center" }}>
          See the public transparency page instead
        </a>
      </form>
    </div>
  );
}
