import React from "react";

/** Desktop top bar — page title + a contract/network status line, used at
 * the head of every funder-portal page. */
export default function TopBar({ title, subtitle }) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        padding: "16px 24px",
        background: "var(--paper-page)",
        fontFamily: "var(--font-sans)",
        boxSizing: "border-box",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {title && <h2 style={{ font: "var(--text-h2)", color: "var(--text)", margin: 0 }}>{title}</h2>}
      {subtitle && (
        <span style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginLeft: "auto" }}>{subtitle}</span>
      )}
    </header>
  );
}
