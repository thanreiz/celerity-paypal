import React, { useEffect, useLayoutEffect, useState } from "react";
import Button from "./Button";

/**
 * Celerity-native coach tip — dove mark, green accent bar, step dots.
 * Interaction pattern is universal (anchor + next/back); chrome is ours.
 */
export default function CoachTour({ steps, rootRef, onComplete, onSkip }) {
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState({ top: 120, placement: "below" });
  const step = steps[idx];
  const total = steps.length;
  const isLast = idx >= total - 1;

  const finish = () => onComplete?.();
  const skip = () => onSkip?.() ?? onComplete?.();

  useLayoutEffect(() => {
    if (!step) return;
    const root = rootRef?.current;
    const el = root?.querySelector?.(`[data-tour="${step.anchor}"]`)
      || document.querySelector(`[data-tour="${step.anchor}"]`);

    // Clear previous highlights
    document.querySelectorAll(".cel-tour-anchor").forEach((n) => n.classList.remove("cel-tour-anchor"));

    if (el) {
      el.classList.add("cel-tour-anchor");
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const rootBox = root?.getBoundingClientRect?.() || { top: 0, left: 0, height: window.innerHeight };
      const box = el.getBoundingClientRect();
      const spaceBelow = rootBox.height - (box.bottom - rootBox.top);
      if (spaceBelow < 220) {
        // Sit above the control with room for ~180px card
        setPos({ top: Math.max(12, box.top - rootBox.top - 188), placement: "below" });
      } else {
        setPos({ top: box.bottom - rootBox.top + 12, placement: "below" });
      }
    } else {
      setPos({ top: 120, placement: "center" });
    }

    return () => {
      document.querySelectorAll(".cel-tour-anchor").forEach((n) => n.classList.remove("cel-tour-anchor"));
    };
  }, [step, rootRef, idx]);

  useEffect(() => () => {
    document.querySelectorAll(".cel-tour-anchor").forEach((n) => n.classList.remove("cel-tour-anchor"));
  }, []);

  if (!step) return null;

  return (
    <div className="cel-tour-root" role="dialog" aria-label="Tutorial">
      <div className="cel-tour-scrim" onClick={skip} />
      <div className="cel-tour-card" style={{ top: pos.top }}>
        <div className="cel-tour-accent" />
        <div className="cel-tour-body">
          <div className="cel-tour-top">
            <span className="cel-tour-mark" aria-hidden="true">
              <img src="/logo-dove.png" alt="" />
            </span>
            <h3 className="cel-tour-title">{step.title}</h3>
            <button type="button" className="cel-tour-x cel-press" aria-label="Skip tutorial" onClick={skip}>
              ×
            </button>
          </div>
          <p className="cel-tour-copy">{step.body}</p>
          {step.chip && <span className="cel-tour-chip">{step.chip}</span>}
          <div className="cel-tour-foot">
            <span className="cel-tour-dots" aria-label={`Step ${idx + 1} of ${total}`}>
              {steps.map((s, i) => (
                <i key={s.id} className={i === idx ? "on" : undefined} />
              ))}
            </span>
            <div className="cel-tour-actions">
              {idx > 0 && (
                <Button variant="outline" size="sm" onClick={() => setIdx((i) => i - 1)}>
                  Back
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (isLast) finish();
                  else setIdx((i) => i + 1);
                }}
              >
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
