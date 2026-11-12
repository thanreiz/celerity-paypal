import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keyboard behaviour for a modal dialog: Escape closes, focus moves into the
 * dialog on open, Tab stays inside it, and focus goes back to whatever opened
 * it on close. Put the returned ref on the dialog element, with tabIndex={-1}. */
export function useDialog(onClose) {
  const ref = useRef(null);
  // Keep the latest handler without re-running the effect (which would
  // steal focus back to the dialog on every render).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const node = ref.current;
    // Prefer the first field or button; fall back to the dialog itself.
    const first = node?.querySelector("input, textarea, select, button:not([aria-label='Close'])");
    (first || node)?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.getClientRects().length);
      if (!items.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const a = items[0];
      const z = items[items.length - 1];
      if (!node.contains(document.activeElement) || (e.shiftKey && (document.activeElement === a || document.activeElement === node))) {
        e.preventDefault();
        (e.shiftKey ? z : a).focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus?.();
    };
  }, []);

  return ref;
}
