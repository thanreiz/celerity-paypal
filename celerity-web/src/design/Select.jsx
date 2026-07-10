import React from "react";

/** Dropdown select, matching Input's visual language. */
export default function Select({ label, value, onChange, options = [], ...rest }) {
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
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={onChange}
          {...rest}
          style={{
            appearance: "none",
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--outline)",
            color: "var(--text)",
            borderRadius: "var(--radius-input)",
            padding: "10px 36px 10px 14px",
            minHeight: 44,
            font: "var(--text-table)",
            cursor: "pointer",
            outline: "none",
          }}
        >
          {options.map((opt) => (
            <option key={opt.value ?? opt} value={opt.value ?? opt}>
              {opt.label ?? opt}
            </option>
          ))}
        </select>
        <span
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: "var(--text-faint)",
            fontSize: 12,
          }}
        >
          ▾
        </span>
      </div>
    </label>
  );
}
