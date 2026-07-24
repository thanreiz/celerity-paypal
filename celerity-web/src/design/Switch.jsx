import React from "react";

/** iOS-style toggle switch, used in Funder Settings (notification prefs). */
export default function Switch({ checked = false, onChange }) {
  return (
    <label style={{ position: "relative", display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, margin: 0, cursor: "pointer" }}
      />
      <span
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          background: checked ? "var(--primary)" : "var(--container-highest)",
          transition: "background-color var(--transition-base)",
          position: "relative",
          display: "inline-block",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left var(--transition-base), transform var(--transition-fast)",
            transform: checked ? "scale(1)" : "scale(0.96)",
          }}
        />
      </span>
    </label>
  );
}
