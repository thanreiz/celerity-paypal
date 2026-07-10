import React from "react";

/** Circular icon mark with a dotted accent ring — the farmer app's brand
 * badge and the icon-in-circle used at the head of each list row. */
export default function IconBadge({ children, size = 64, ring = true, tone = "primary" }) {
  const tones = {
    primary: { bg: "var(--primary)", fg: "#fff", ringColor: "var(--accent)" },
    soft: { bg: "rgba(22,69,45,0.1)", fg: "var(--primary)", ringColor: "transparent" },
  };
  const t = tones[tone] || tones.primary;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {ring && (
        <div
          style={{
            position: "absolute",
            inset: -5,
            borderRadius: "50%",
            border: `2px dashed ${t.ringColor}`,
          }}
        />
      )}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: t.bg,
          color: t.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.42,
        }}
      >
        {children}
      </div>
    </div>
  );
}
