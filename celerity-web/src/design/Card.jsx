import React from "react";

/** White, 16px radius, soft shadow card — the base surface for nearly every
 * piece of content in the app. variant="oracle" is the ONE amber-tinted
 * surface, reserved for demo/simulation elements (never live infra). */
export default function Card({ variant = "default", title, children, style }) {
  const isOracle = variant === "oracle";
  return (
    <section
      style={{
        background: isOracle
          ? "linear-gradient(0deg, rgba(255,248,225,0.35), rgba(255,248,225,0.35)), var(--surface)"
          : "var(--surface)",
        border: `1px solid ${isOracle ? "var(--warn-line)" : "var(--container-highest)"}`,
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--space-card-padding)",
        fontFamily: "var(--font-sans)",
        overflowX: "auto",
        ...style,
      }}
    >
      {title && (
        <h2 style={{ font: "var(--text-h2)", color: "var(--text)", margin: "0 0 16px", letterSpacing: "var(--tracking-tight)" }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
