import React, { useCallback, useEffect, useRef, useState } from "react";
import FunderPortal from "./pages/funder/FunderPortal";
import FarmerApp from "./pages/farmer/FarmerApp";
import TransparencyLedgerPage from "./pages/transparency/TransparencyLedgerPage";
import Toast from "./design/Toast";
import { farmerReceipts, addr } from "./lib/celerity";
import { friendlyError } from "./lib/errors";

const FARMER_ROLE_KEY = "celerity.farmer.activeRole";

function loadFarmerRole() {
  try {
    const r = localStorage.getItem(FARMER_ROLE_KEY);
    return r === "farmer2" ? "farmer2" : "farmer";
  } catch {
    return "farmer";
  }
}

export default function App() {
  const [devOpen, setDevOpen] = useState(false);
  const [devSurface, setDevSurface] = useState("funder");
  const [pools, setPools] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  // View-as: Mang Ramon (farmer) or Aling Nena (farmer2).
  const [farmerRole, setFarmerRole] = useState(loadFarmerRole);
  const farmerRoleRef = useRef(farmerRole);
  farmerRoleRef.current = farmerRole;
  // Which identity the current `receipts` array belongs to — so an empty
  // read for Nena doesn't revive Ramon's last-good balance (and vice versa).
  const receiptsRoleRef = useRef(farmerRole);

  const notify = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 12000 : 5000);
  }, []);

  const refresh = useCallback(async () => {
    const role = farmerRoleRef.current;
    const { pools, receipts } = await farmerReceipts(addr(role));
    setPools((prev) => (pools.length === 0 && prev.length > 0 ? prev : pools));
    setReceipts((prev) => {
      const sameIdentity = receiptsRoleRef.current === role;
      if (receipts.length === 0 && prev.length > 0 && sameIdentity) {
        // Transient empty for the SAME farmer — keep last-good.
        return prev;
      }
      receiptsRoleRef.current = role;
      return receipts;
    });
    loadedRef.current = true;
    setLoaded(true);
  }, []);

  const switchFarmer = useCallback(
    (role) => {
      const next = role === "farmer2" ? "farmer2" : "farmer";
      try {
        localStorage.setItem(FARMER_ROLE_KEY, next);
      } catch {
        /* ignore */
      }
      farmerRoleRef.current = next;
      receiptsRoleRef.current = next;
      setFarmerRole(next);
      setReceipts([]);
      setLoaded(false);
      loadedRef.current = false;
      refresh().catch((e) => notify(friendlyError(e), true));
    },
    [refresh, notify]
  );

  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled && !loadedRef.current) notify(friendlyError(e), true);
      }
      if (cancelled) return;
      const next = loadedRef.current ? 15000 : 3000;
      timer = setTimeout(tick, next);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh, notify, farmerRole]);

  const run = useCallback(
    async (label, fn) => {
      setBusy(true);
      try {
        const result = await fn();
        notify(`${label} ✓`);
        await new Promise((r) => setTimeout(r, 1500));
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

  if (devOpen) {
    return (
      <div style={{ minHeight: "100dvh" }}>
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
        farmerRole={farmerRole}
        onSwitchFarmer={switchFarmer}
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
