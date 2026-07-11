import React, { useCallback, useEffect, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    const { pools, receipts } = await farmerReceipts(addr("farmer"));
    setPools(pools);
    setReceipts(receipts);
    setLoaded(true);
  }, []);

  // Errors linger long enough to read from the back row; successes clear fast.
  const notify = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 12000 : 5000);
  }, []);

  useEffect(() => {
    refresh().catch((e) => notify(friendlyError(e), true));
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
