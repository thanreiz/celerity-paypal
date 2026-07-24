import React, { useEffect, useLayoutEffect, useState } from "react";
import Button from "./Button";

const CARD_H = 240;
const GAP = 14;
const PAD = 10;

/**
 * Celerity-native coach tip — dove mark, green accent bar, step dots.
 * Spotlights the anchored control with a cutout so the tip never hides what
 * it is explaining (especially on phone-width funder / farmer shells).
 */
export default function CoachTour({ steps, rootRef, onComplete, onSkip }) {
  const [idx, setIdx] = useState(0);
  const [layout, setLayout] = useState({
    hole: null,
    cardTop: 120,
    cardMaxWidth: 340,
  });
  const step = steps[idx];
  const total = steps.length;
  const isLast = idx >= total - 1;

  const finish = () => onComplete?.();
  const skip = () => onSkip?.() ?? onComplete?.();

  useLayoutEffect(() => {
    if (!step) return;

    const measure = () => {
      const root = rootRef?.current;
      const el =
        root?.querySelector?.(`[data-tour="${step.anchor}"]`) ||
        document.querySelector(`[data-tour="${step.anchor}"]`);

      document.querySelectorAll(".cel-tour-anchor").forEach((n) => {
        n.classList.remove("cel-tour-anchor");
      });

      if (!el || !root) {
        setLayout({ hole: null, cardTop: 120, cardMaxWidth: 340 });
        return;
      }

      el.classList.add("cel-tour-anchor");
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });

      const rootBox = root.getBoundingClientRect();
      const box = el.getBoundingClientRect();

      let top = box.top - rootBox.top - PAD;
      let left = box.left - rootBox.left - PAD;
      let width = box.width + PAD * 2;
      let height = box.height + PAD * 2;

      // Keep the hole inside the shell
      top = Math.max(6, Math.min(top, rootBox.height - height - 6));
      left = Math.max(6, Math.min(left, rootBox.width - width - 6));
      width = Math.min(width, rootBox.width - left - 6);
      height = Math.min(height, rootBox.height - top - 6);

      const hole = { top, left, width, height };
      const spaceBelow = rootBox.height - (top + height) - 16;
      const spaceAbove = top - 16;

      let cardTop;
      if (spaceBelow >= CARD_H || spaceBelow >= spaceAbove) {
        cardTop = top + height + GAP;
      } else {
        cardTop = top - CARD_H - GAP;
      }
      cardTop = Math.max(12, Math.min(cardTop, rootBox.height - CARD_H - 12));

      setLayout({
        hole,
        cardTop,
        cardMaxWidth: Math.min(340, rootBox.width - 32),
      });
    };

    // Measure twice: once now, once after scrollIntoView settles
    measure();
    const t = window.setTimeout(measure, 280);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      document.querySelectorAll(".cel-tour-anchor").forEach((n) => {
        n.classList.remove("cel-tour-anchor");
      });
    };
  }, [step, rootRef, idx]);

  useEffect(
    () => () => {
      document.querySelectorAll(".cel-tour-anchor").forEach((n) => {
        n.classList.remove("cel-tour-anchor");
      });
    },
    []
  );

  if (!step) return null;

  const { hole, cardTop, cardMaxWidth } = layout;

  return (
    <div className="cel-tour-root" role="dialog" aria-label="Tutorial" aria-describedby="cel-tour-copy">
      {/* Transparent click-catcher — dimming comes from the spotlight shadow */}
      <div className="cel-tour-blocker" onClick={skip} aria-hidden="true" />

      {hole && (
        <div
          className="cel-tour-spotlight"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
          aria-hidden="true"
        />
      )}

      <div
        className="cel-tour-card"
        style={{
          top: cardTop,
          maxWidth: cardMaxWidth,
        }}
      >
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
          <p id="cel-tour-copy" className="cel-tour-copy">
            {step.body}
          </p>
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
