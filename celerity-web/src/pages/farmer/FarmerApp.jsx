import React, { useEffect, useState } from "react";
import BottomNav from "../../design/BottomNav";
import HomeScreen from "./HomeScreen";
import ActivityScreen from "./ActivityScreen";
import ProfileScreen from "./ProfileScreen";
import CashOutFlow from "./CashOutFlow";
import DetailScreen from "./DetailScreen";
import { addr, invoke, view } from "../../lib/celerity";
import { friendlyError } from "../../lib/errors";
import { UNIT } from "../../lib/config";

export default function FarmerApp({ pools, receipts, busy, setBusy, refresh, notify, onOpenDev }) {
  const [page, setPage] = useState("home");
  const [overlay, setOverlay] = useState(null); // null | "cashout" | "programs" | "installments" | "region" | "help"
  const [registration, setRegistration] = useState(null);
  const me = addr("farmer");
  const farmerName = "Mang Ramon";

  useEffect(() => {
    view("farmer", { addr: me }).then(setRegistration).catch(() => setRegistration(null));
  }, [me, pools]);

  const claim = async (poolId) => {
    setBusy(true);
    try {
      await invoke("farmer", "claim", { farmer: me, pool_id: poolId });
      notify("Installment claimed ✓");
      await new Promise((r) => setTimeout(r, 1500));
      await refresh();
    } catch (e) {
      notify(`Claim: ${friendlyError(e)}`, true);
    } finally {
      setBusy(false);
    }
  };

  const totalUnits = receipts.reduce((sum, r) => sum + Number(BigInt(r.amount)) / Number(UNIT), 0);

  return (
    <div style={{ width: "100%", maxWidth: 430, margin: "0 auto", minHeight: "100dvh", background: "var(--paper-page)", display: "flex", flexDirection: "column", position: "relative", overflowX: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px 0" }}>
        <button
          onClick={onOpenDev}
          style={{
            border: "1px solid var(--container-highest)",
            background: "#fff",
            color: "var(--text-faint)",
            borderRadius: 999,
            padding: "5px 12px",
            font: "var(--text-fine)",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          ⚙ Funder console
        </button>
      </div>

      <div style={{ flex: 1 }}>
        {page === "home" && (
          <HomeScreen
            pools={pools}
            receipts={receipts}
            busy={busy}
            claim={claim}
            onCashOut={() => setOverlay("cashout")}
            onHistory={() => setPage("activity")}
            onDetail={(kind) => setOverlay(kind)}
          />
        )}
        {page === "activity" && <ActivityScreen receipts={receipts} pools={pools} />}
        {page === "profile" && <ProfileScreen me={me} registration={registration} farmerName={farmerName} />}
      </div>
      <BottomNav active={page} onNavigate={setPage} />

      {overlay === "cashout" && <CashOutFlow availableUnits={totalUnits} onClose={() => setOverlay(null)} />}
      {["programs", "installments", "region", "help"].includes(overlay) && (
        <DetailScreen kind={overlay} pools={pools} registration={registration} onBack={() => setOverlay(null)} />
      )}
    </div>
  );
}
