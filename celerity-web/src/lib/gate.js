// Stage demo gate PIN — sessionStorage only, never localStorage.
const KEY = "celerity.demoGate.v1";

export function getGate() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setGate(pin) {
  try {
    sessionStorage.setItem(KEY, String(pin || ""));
  } catch {
    /* private browsing */
  }
}

export function clearGate() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

let promptImpl = null;

/** App registers a Promise-returning PIN modal. */
export function registerGatePrompt(fn) {
  promptImpl = fn;
}

/**
 * Ensure a demo PIN is in session. Opens the registered modal once if needed.
 * Throws if the user cancels.
 */
export async function ensureGate() {
  const existing = getGate();
  if (existing) return existing;
  if (!promptImpl) {
    throw new Error("Demo PIN required — open the app UI to enter it.");
  }
  const pin = await promptImpl();
  if (!pin) throw new Error("Demo PIN cancelled");
  setGate(pin);
  return pin;
}
