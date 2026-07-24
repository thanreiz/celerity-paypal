import React, { useState } from "react";

/** State-aware Tutorial panel — demo loop next-step for judges. */
export default function DemoGuide({ pools, farmerCount, releases, onGoto, onCreatePool, onReplayTour }) {
  const steps = [
    {
      label: "Fund a pool",
      detail: "Escrow money with a release rule: region + typhoon signal.",
      done: pools.length > 0,
      action: "New pool",
      go: onCreatePool,
    },
    {
      label: "Enroll a farmer (as LGU)",
      detail: "The government keeps the list of who's eligible — not funders, not the contract.",
      // Releases imply farmers already exist (registry load can race to 0).
      done: farmerCount > 0 || releases > 0,
      action: "Open registry",
      go: () => onGoto("farmers"),
    },
    {
      label: "Trigger the typhoon",
      detail: "Drop the PAGASA bulletin — every matching region settles in one pass.",
      done: releases > 0,
      action: "Open trigger",
      go: () => onGoto("oracle"),
    },
    {
      label: "Watch the money land",
      detail: "Per-funder ledger here; the farmer sees it in their app.",
      done: releases > 0,
      action: "Open ledger",
      go: () => onGoto("ledger"),
    },
  ];
  const nextIdx = steps.findIndex((s) => !s.done);
  const allDone = nextIdx === -1;
  const [open, setOpen] = useState(!allDone);

  return (
    <section
      data-tour="tutorial"
      className="cel-card-surface"
      style={{ width: "100%", boxSizing: "border-box" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: allDone ? "var(--ok-bg)" : "var(--primary)",
            color: allDone ? "var(--ok-text)" : "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {allDone ? "✓" : nextIdx + 1}
        </span>
        <span style={{ font: "var(--text-body-lg)", fontWeight: 700, color: "var(--text)" }}>
          {allDone
            ? "Tutorial complete — money moved on a signed signal"
            : `Tutorial — next: ${steps[nextIdx].label}`}
        </span>
        <span style={{ marginLeft: "auto", font: "var(--text-fine)", color: "var(--text-faint)", fontWeight: 700 }}>
          {open ? "Hide ▲" : "Show ▼"}
        </span>
      </button>

      {open && (
        <div className="cel-expand" style={{ padding: "0 20px 18px" }}>
          <p style={{ margin: "0 0 12px", font: "var(--text-fine)", color: "var(--text-faint)" }}>
            How this console works — follow the live next step for the demo loop.
          </p>
          <ol
            className="cel-stagger"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {steps.map((s, i) => {
              const isNext = i === nextIdx;
              return (
                <li
                  key={s.label}
                  style={{
                    border: isNext ? "1.5px solid var(--primary)" : "1px solid var(--border-subtle)",
                    background: isNext ? "var(--surface-low)" : "var(--surface)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    opacity: !s.done && !isNext ? 0.55 : 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 800,
                        background: s.done ? "var(--ok-bg)" : isNext ? "var(--primary)" : "var(--container-high)",
                        color: s.done ? "var(--ok-text)" : isNext ? "#fff" : "var(--text-dim)",
                      }}
                    >
                      {s.done ? "✓" : i + 1}
                    </span>
                    <strong style={{ font: "var(--text-body-lg)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {s.label}
                    </strong>
                  </div>
                  <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)" }}>{s.detail}</p>
                  <button
                    onClick={s.go}
                    className="cel-press"
                    style={{
                      alignSelf: "flex-start",
                      marginTop: "auto",
                      border: "none",
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                      background: isNext ? "var(--primary)" : "var(--container-high)",
                      color: isNext ? "#fff" : "var(--text-dim)",
                    }}
                  >
                    {s.action} →
                  </button>
                </li>
              );
            })}
          </ol>
          {onReplayTour && (
            <button
              type="button"
              onClick={onReplayTour}
              className="cel-press"
              style={{
                marginTop: 14,
                border: "none",
                background: "none",
                color: "var(--primary)",
                font: "var(--text-fine)",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                padding: 0,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Replay coach tips
            </button>
          )}
        </div>
      )}
    </section>
  );
}
