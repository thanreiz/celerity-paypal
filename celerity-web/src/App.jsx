import React, { useCallback, useEffect, useRef, useState } from "react";
import FunderPortal from "./pages/funder/FunderPortal";
import FarmerApp from "./pages/farmer/FarmerApp";
import TransparencyLedgerPage from "./pages/transparency/TransparencyLedgerPage";
import Toast from "./design/Toast";
import GateModal from "./design/GateModal";
import { farmerReceipts, addr, loadAddresses } from "./lib/celerity";
import { registerGatePrompt } from "./lib/gate";
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
  const [bootReady, setBootReady] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const gateResolver = useRef(null);
  const [farmerRole, setFarmerRole] = useState(loadFarmerRole);
  const farmerRoleRef = useRef(farmerRole);
  farmerRoleRef.current = farmerRole;
  const receiptsRoleRef = useRef(farmerRole);

  const notify = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 12000 : 5000);
  }, []);

  useEffect(() => {
    registerGatePrompt(
      () =>
        new Promise((resolve, reject) => {
          gateResolver.current = { resolve, reject };
          setGateOpen(true);
        })
    );
    return () => registerGatePrompt(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAddresses()
      .then(() => {
        if (!cancelled) setBootReady(true);
      })
      .catch((e) => {
        if (!cancelled) notify(friendlyError(e), true);
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const refresh = useCallback(async () => {
    await loadAddresses();
    const role = farmerRoleRef.current;
    const { pools, receipts } = await farmerReceipts(addr(role));
    setPools((prev) => (pools.length === 0 && prev.length > 0 ? prev : pools));
    setReceipts((prev) => {
      const sameIdentity = receiptsRoleRef.current === role;
      if (receipts.length === 0 && prev.length > 0 && sameIdentity) {
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
    if (!bootReady) return;
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
  }, [refresh, notify, farmerRole, bootReady]);

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

  const gateModal = (
    <GateModal
      open={gateOpen}
      onSubmit={async (pin) => {
        gateResolver.current?.resolve(pin);
        gateResolver.current = null;
        setGateOpen(false);
      }}
      onCancel={() => {
        gateResolver.current?.reject(new Error("Demo PIN cancelled"));
        gateResolver.current = null;
        setGateOpen(false);
      }}
    />
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
        {gateModal}
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
      {gateModal}
    </div>
  );
}
