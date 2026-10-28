import React from "react";
import Badge from "../../design/Badge";

/** Page heading: title, one-line lede, optional actions on the right. */
export function PageHeader({ title, lede, children }) {
  return (
    <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between", paddingTop: 20 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ font: "var(--text-h1)", margin: 0, letterSpacing: "var(--tracking-tight)" }}>{title}</h1>
        {lede && <p style={{ font: "var(--text-meta)", color: "var(--text-dim)", margin: "4px 0 0", maxWidth: 640 }}>{lede}</p>}
      </div>
      {children && <div className="cel-row-actions">{children}</div>}
    </header>
  );
}

const PROVIDER_NAMES = { anthropic: "Claude", openai: "OpenAI" };

function Dot({ on }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: on ? "var(--ok-text)" : "var(--warn-text)",
        display: "inline-block",
      }}
    />
  );
}

/** What is wired up on the server, so nobody mistakes a gap for a bug. */
export function SystemStatus({ config }) {
  const items = [
    [config.paypalConfigured, `PayPal ${config.paypalEnv}`, "PayPal keys missing"],
    [config.aiConfigured, `${PROVIDER_NAMES[config.aiProvider] || "AI"} agent (${config.model})`, "AI key missing"],
    [config.webhooksVerified, "Webhooks verified", "Webhooks off: use Refresh"],
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {items.map(([on, yes, no]) => (
        <span
          key={yes}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            font: "var(--text-fine)",
            color: "var(--text-dim)",
            background: "var(--surface)",
            border: "1px solid var(--container-highest)",
            borderRadius: "var(--radius-chip)",
            padding: "4px 10px",
          }}
        >
          <Dot on={on} />
          {on ? yes : no}
        </span>
      ))}
      {config.paypalEnv === "sandbox" && <Badge stub>Sandbox money</Badge>}
    </div>
  );
}

export function Label({ children }) {
  return <p className="cel-section-label">{children}</p>;
}
