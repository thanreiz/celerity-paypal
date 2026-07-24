import React from "react";

const ICONS = {
  pools: (
    // landmark/bank — escrowed funds
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
      <path d="M3 20h18" />
    </>
  ),
  farmers: (
    // two people — registry
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.2 2.6-5 5.5-5s5.5 1.8 5.5 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 15.2c2 .7 3.5 2.2 3.5 4.8" />
    </>
  ),
  oracle: (
    // bolt — the trigger
    <path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5Z" />
  ),
  ledger: (
    // rows — the record
    <>
      <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />
    </>
  ),
  settings: (
    // sliders
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
      <circle cx="15" cy="7" r="1.8" />
      <circle cx="9" cy="12" r="1.8" />
      <circle cx="15" cy="17" r="1.8" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {ICONS[name]}
    </svg>
  );
}

/** Desktop side navigation — ordered by the demo flow, each item carries a
 * step number, icon, and a one-line "what this is" so a first-time user can
 * navigate without a tour. */
export default function SideNav({ active, onNavigate, userName, onCreatePool }) {
  const items = [
    { key: "pools", label: "Pools", desc: "Earmarked relief escrow", step: 1 },
    { key: "farmers", label: "Farmers", desc: "LGU-maintained registry", step: 2 },
    { key: "oracle", label: "Trigger typhoon", desc: "Simulated signed event", step: 3 },
    { key: "ledger", label: "Ledger", desc: "Every release, accounted", step: 4 },
    { key: "settings", label: "Settings", desc: "Identities & contract" },
  ];
  return (
    <nav
      style={{
        width: 256,
        flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--container-highest)",
        display: "flex",
        flexDirection: "column",
        padding: "32px 16px",
        fontFamily: "var(--font-sans)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ padding: "0 16px", marginBottom: 32 }}>
        <h1 style={{ font: "var(--text-h1)", fontSize: 24, color: "var(--primary)", margin: 0, letterSpacing: "var(--tracking-tight)" }}>
          Celerity Funder
        </h1>
        <p style={{ font: "var(--text-fine)", color: "var(--text-faint)", margin: "4px 0 0" }}>Institutional Portal</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <button
              key={it.key}
              onClick={() => onNavigate && onNavigate(it.key)}
              className={`cel-press cel-nav-side${isActive ? " is-active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 8,
                cursor: "pointer",
                border: "none",
                textAlign: "left",
                font: "inherit",
                fontFamily: "var(--font-sans)",
                color: isActive ? "var(--primary)" : "var(--text-dim)",
                background: isActive ? "var(--surface-low)" : "transparent",
                borderRight: isActive ? "4px solid var(--primary)" : "4px solid transparent",
              }}
            >
              <Icon name={it.key} />
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <span style={{ fontWeight: isActive ? 700 : 600, fontSize: 15 }}>{it.label}</span>
                <span style={{ font: "var(--text-fine)", fontSize: 11, color: "var(--text-faint)", fontWeight: 500 }}>
                  {it.desc}
                </span>
              </span>
              {it.step && (
                <span
                  style={{
                    marginLeft: "auto",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: isActive ? "var(--primary)" : "var(--container-high)",
                    color: isActive ? "#fff" : "var(--text-faint)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {it.step}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={onCreatePool}
        className="cel-press"
        style={{
          width: "100%",
          background: "var(--primary)",
          color: "var(--on-primary)",
          border: "none",
          borderRadius: "var(--radius-input)",
          padding: "12px 16px",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          marginTop: 12,
          fontFamily: "var(--font-sans)",
          boxShadow: "var(--shadow-raised)",
        }}
      >
        + New Escrow Pool
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 4px 0", borderTop: "1px solid var(--container-highest)" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--container-high)", flexShrink: 0 }} />
        <span style={{ font: "var(--text-meta)", fontWeight: 700, color: "var(--text)" }}>{userName}</span>
      </div>
    </nav>
  );
}
