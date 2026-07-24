import React from "react";

/**
 * Pill-shaped button, 999px radius, 44px min-height touch target.
 * variant "primary" is reserved for money-moving actions (deposit, claim,
 * sign & settle) — forest green, soft green shadow. Never use primary for
 * anything that doesn't move money.
 */
export default function Button({
  variant = "default",
  size = "md",
  disabled = false,
  icon = null,
  children,
  onClick,
  type = "button",
  style,
  className = "",
  ...rest
}) {
  const base = {
    fontFamily: "var(--font-sans)",
    fontWeight: 700,
    fontSize: size === "sm" ? 14 : 15,
    minHeight: size === "sm" ? 36 : 44,
    padding: size === "sm" ? "8px 18px" : "10px 24px",
    borderRadius: "var(--radius-control)",
    border: "1px solid transparent",
    cursor: disabled ? "progress" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition:
      "background-color var(--transition-base), border-color var(--transition-base), color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-fast), filter var(--transition-fast)",
    opacity: disabled ? 0.45 : 1,
  };

  const variants = {
    primary: {
      background: "var(--primary)",
      color: "var(--on-primary)",
      boxShadow: "var(--shadow-raised)",
    },
    default: {
      background: "var(--container-high)",
      color: "var(--text)",
    },
    on: {
      background: "var(--primary-chip)",
      color: "var(--on-primary-chip)",
      fontWeight: 700,
    },
    outline: {
      background: "var(--surface)",
      color: "var(--primary)",
      border: "1px solid var(--primary)",
    },
    ghost: {
      background: "transparent",
      color: "var(--primary)",
    },
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`cel-press ${className}`.trim()}
      style={{ ...base, ...variants[variant], ...style }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
