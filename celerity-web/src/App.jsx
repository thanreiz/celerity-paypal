import React, { useCallback, useEffect, useState } from "react";
import FunderView from "./components/FunderView";
import FarmerView from "./components/FarmerView";
import OraclePanel from "./components/OraclePanel";
import { farmerReceipts, addr } from "./lib/celerity";
import { friendlyError } from "./lib/errors";
import { CONTRACT_ID, short } from "./lib/config";

export default function App() {
  const [tab, setTab] = useState("funder");
  const [pools, setPools] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    const { pools, receipts } = await farmerReceipts(addr("farmer"));
    setPools(pools);
    setReceipts(receipts);
  }, []);

  // Errors linger long enough to read from the back row; successes clear fast.
  const notify = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 12000 : 5000);
  }, []);

  useEffect(() => {
    refresh().catch((e) => notify(friendlyError(e), true));
  }, [refresh, notify]);

  return (
    <div className="app">
      <header>
        <h1>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Celerity <span className="tagline">disaster money that moves itself</span>
        </h1>
        <div className="contract">
          Stellar Testnet · contract {short(CONTRACT_ID)} · everything on-chain is live
        </div>
        <nav>
          <button className={tab === "funder" ? "on" : ""} onClick={() => setTab("funder")}>
            Funder
          </button>
          <button className={tab === "farmer" ? "on" : ""} onClick={() => setTab("farmer")}>
            Farmer
          </button>
        </nav>
      </header>

      <OraclePanel busy={busy} setBusy={setBusy} refresh={refresh} notify={notify} />

      {tab === "funder" ? (
        <FunderView pools={pools} busy={busy} setBusy={setBusy} refresh={refresh} notify={notify} />
      ) : (
        <FarmerView
          pools={pools}
          receipts={receipts}
          busy={busy}
          setBusy={setBusy}
          refresh={refresh}
          notify={notify}
        />
      )}

      {toast && <div className={`toast${toast.isError ? " error" : ""}`}>{toast.msg}</div>}
    </div>
  );
}
