import React, { useState } from "react";

/** White input, 12px radius, outline border, 44px min-height. Border turns
 * green on hover/focus, plus a 2px green focus ring. Label sits above,
 * uppercase 12px/700. */
export default function Input({ label, type = "text", value, onChange, placeholder, prefix, suffix, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontFamily: "var(--font-sans)" }}>
      {label && (
        <span
          style={{
            font: "var(--text-label)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-label)",
            color: "var(--text-dim)",
          }}
        >
          {label}
        </span>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {prefix && (
          <span style={{ position: "absolute", left: 14, color: "var(--text-dim)", font: "var(--text-table)" }}>
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
          style={{
            background: "var(--surface)",
            border: `1px solid ${focused ? "var(--primary)" : "var(--outline)"}`,
            color: "var(--text)",
            borderRadius: "var(--radius-input)",
            padding: `10px 14px 10px ${prefix ? 26 : 14}px`,
            minHeight: 44,
            font: "var(--text-table)",
            width: "100%",
            outline: focused ? "2px solid rgba(22,69,45,0.18)" : "none",
            outlineOffset: 1,
            transition: "border-color var(--transition-base), box-shadow var(--transition-base)",
          }}
        />
        {suffix && (
          <span style={{ position: "absolute", right: 14, color: "var(--text-dim)", font: "var(--text-label)" }}>
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
