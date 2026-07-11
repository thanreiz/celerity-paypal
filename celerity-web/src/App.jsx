import React, { useCallback, useEffect, useRef, useState } from "react";
import FunderPortal from "./pages/funder/FunderPortal";
import FarmerApp from "./pages/farmer/FarmerApp";
import TransparencyLedgerPage from "./pages/transparency/TransparencyLedgerPage";
import Toast from "./design/Toast";
import { farmerReceipts, addr } from "./lib/celerity";
import { friendlyError } from "./lib/errors";

export default function App() {
  const [devOpen, setDevOpen] = useState(false);
  const [devSurface, setDevSurface] = useState("funder");
  const [pools, setPools] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loaded, setLoaded] = useState(false); // first successful chain read
  const loadedRef = useRef(false); // mirror for the polling closure
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    const { pools, receipts } = await farmerReceipts(addr("farmer"));
    // Guard against a flaky read blanking a populated wallet: if the chain
    // read comes back empty but we already had pools/receipts, keep the
    // last-good state instead of wiping it. A genuine empty only stands on the
    // first load (nothing to lose) — once we've seen data, an empty result is
    // treated as a transient miss, not "everything is gone". allPools() already
    // throws rather than returning [] on an RPC flake; this is the belt-and-
    // suspenders for the ledger reads too.
    setPools((prev) => (pools.length === 0 && prev.length > 0 ? prev : pools));
    setReceipts((prev) => (receipts.length === 0 && prev.length > 0 ? prev : receipts));
    loadedRef.current = true;
    setLoaded(true);
  }, []);

  // Errors linger long enough to read from the back row; successes clear fast.
  const notify = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 12000 : 5000);
  }, []);

  // Initial load + resilient polling. Testnet reads flake, and a single failed
  // read must never leave the wallet stuck empty. So: keep the chain in view on
  // a slow poll, and retry faster until the first data arrives. Combined with
  // the last-good guards in refresh(), a receipt that's on-chain can't silently
  // vanish — the next tick brings it back.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      try {
        await refresh();
      } catch (e) {
        // Only surface an error before the first successful load (the true
        // "can't reach the chain" case). Once loaded, a failed background tick
        // is silent — the wallet keeps its last-good state and we just retry,
        // so an RPC blip doesn't spam error toasts or blank anything.
        if (!cancelled && !loadedRef.current) notify(friendlyError(e), true);
      }
      if (cancelled) return;
      // Poll fast until we've loaded something, then settle to a calm cadence.
      const next = loadedRef.current ? 15000 : 3000;
      timer = setTimeout(tick, next);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh, notify]);

  const run = useCallback(
    async (label, fn) => {
      setBusy(true);
      try {
        const result = await fn();
        notify(`${label} ✓`);
        await new Promise((r) => setTimeout(r, 1500)); // let the RPC catch up to the write
        await refresh();
        return result;
      } catch (e) {
        notify(`${label}: ${friendlyError(e)}`, true);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [refresh, notify]
  );

  // The funder console owns its own chrome (login screen, corner cluster) —
  // no dev strip. Farmer App / Public Ledger are reachable from its corner.
  if (devOpen) {
    return (
      <div style={{ minHeight: "100dvh" }}>
        {/* keep the portal mounted while the public ledger is open so the
            logged-in identity survives the round trip */}
        <div style={{ display: devSurface === "funder" ? "block" : "none" }}>
          <FunderPortal
            pools={pools}
            loaded={loaded}
            busy={busy}
            run={run}
            refresh={refresh}
            onBackToFarmer={() => {
              setDevOpen(false);
              setDevSurface("funder");
            }}
            onOpenPublic={() => setDevSurface("public")}
          />
        </div>
        {devSurface === "public" && <TransparencyLedgerPage onBack={() => setDevSurface("funder")} />}

        {toast && <Toast message={toast.msg} error={toast.isError} />}
      </div>
    );
  }

  // Farmer app sits centered on a warm-paper backdrop so it reads as a phone
  // with margins on desktop (on an actual phone the column just fills the width).
  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        background: "var(--paper-inset)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "clamp(0px, 4vh, 32px) clamp(0px, 4vw, 32px)",
        boxSizing: "border-box",
      }}
    >
      <FarmerApp
        pools={pools}
        receipts={receipts}
        busy={busy}
        setBusy={setBusy}
        refresh={refresh}
        notify={notify}
        onOpenDev={() => setDevOpen(true)}
      />
      {toast && <Toast message={toast.msg} error={toast.isError} />}
    </div>
  );
}
