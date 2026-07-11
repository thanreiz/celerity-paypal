import React, { useEffect, useRef, useState } from "react";

/**
 * Opening / splash screen for the farmer app.
 *
 * Plays a one-shot launch sequence, then calls onDone() to hand off to the
 * Connect screen:
 *   1. the dove mark (logo-dove.png) rises in and breathes
 *   2. it cross-fades into the dove + "Celerity" lockup (logo-lockup.png) —
 *      the wordmark appears to grow out of the bird
 *   3. the tagline "Relief that moves" rises
 *   4. the whole splash lifts away and we advance
 *
 * Advancement is driven by a JS timer (not animationend) so it still works
 * when animations are disabled — the app's global reduced-motion rule in
 * styles.css turns every animation off, and a user with that setting must
 * still get past the splash. Under reduced motion we show the final lockup +
 * tagline immediately (CSS handles that) and simply advance on the timer.
 *
 * All brand type is Quicksand (--font-sans), loaded app-wide via tokens.css.
 * Presentation lives in styles.css under the `.cel-splash` scope.
 */
const SPLASH_MS = 3200;

export default function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    // start the lift-away a touch before we swap screens, for a clean hand-off
    const leaveTimer = setTimeout(() => setLeaving(true), SPLASH_MS - 450);
    const doneTimer = setTimeout(() => doneRef.current && doneRef.current(), SPLASH_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return (
    <div className={"cel-splash" + (leaving ? " is-leaving" : "")}>
      <div className="cel-splash-halo" />

      <div className="cel-splash-stage">
        <img className="cel-logo-bird" src="/logo-dove.png" alt="" aria-hidden="true" />
        <img className="cel-logo-lockup" src="/logo-lockup.png" alt="Celerity" />
      </div>

      <p className="cel-splash-tag">Relief that moves</p>

      <div className="cel-splash-foot">
        <span className="cel-splash-dots" aria-hidden="true">
          <i className="on" />
          <i />
          <i />
        </span>
        <span className="cel-trust">
          <svg width="13" height="14" viewBox="0 0 13 14" fill="none">
            <path d="M6.5 1 11.5 3.1V6.7C11.5 9.9 9.4 12.3 6.5 13 3.6 12.3 1.5 9.9 1.5 6.7V3.1L6.5 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.5 6.9 6 8.4 8.7 5.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Secured on Stellar
        </span>
      </div>
    </div>
  );
}
