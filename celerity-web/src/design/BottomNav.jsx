import React from "react";

const ICONS = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Mobile bottom tab bar — farmer app. Stays pinned; never scrolls with content. */
export default function BottomNav({ active, onNavigate }) {
  const items = [
    { key: "home", label: "Home" },
    { key: "activity", label: "Activity" },
    { key: "profile", label: "Profile" },
  ];
  return (
    <nav className="cel-bottom-nav" aria-label="Farmer navigation">
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <button
            key={it.key}
            data-tour={it.key}
            onClick={() => onNavigate && onNavigate(it.key)}
            aria-label={it.label}
            className={`cel-press cel-nav-tab${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "8px 18px",
              minWidth: 64,
              minHeight: 44,
              borderRadius: 999,
              cursor: "pointer",
              border: "none",
              fontFamily: "var(--font-sans)",
              background: isActive ? "var(--primary-chip)" : "transparent",
              color: isActive ? "var(--on-primary-chip)" : "var(--text-dim)",
            }}
          >
            <Icon name={it.key} />
            <span style={{ font: "var(--text-label)", fontSize: 11 }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
