import React from "react";

/** Circular initials avatar — used throughout the farmer registry/team
 * tables in place of a photo. No stock photography in this system. */
export default function Avatar({ initials, size = 40, tone = "primary" }) {
  const tones = {
    primary: { bg: "rgba(22,69,45,0.12)", color: "var(--primary)" },
    neutral: { bg: "var(--container-high)", color: "var(--text-dim)" },
  };
  const t = tones[tone] || tones.primary;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: t.bg,
        color: t.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
