import React, { useCallback, useEffect, useState } from "react";
import FunderView from "./components/FunderView";
import FarmerView from "./components/FarmerView";
import OraclePanel from "./components/OraclePanel";
import { allPools, farmerReceipts, addr } from "./lib/celerity";
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

  useEffect(() => {
    refresh().catch((e) => setToast(String(e.message || e)));
  }, [refresh]);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  };

  return (
    <div className="app">
      <header>
        <h1>
          ⚡ Celerity <span className="tagline">disaster money that moves itself</span>
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
