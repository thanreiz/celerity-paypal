import React, { useEffect, useRef, useState } from "react";
import BottomNav from "../../design/BottomNav";
import SplashScreen from "./SplashScreen";
import ConnectScreen from "./ConnectScreen";
import HomeScreen from "./HomeScreen";
import ActivityScreen from "./ActivityScreen";
import ProfileScreen from "./ProfileScreen";
import CashOutFlow from "./CashOutFlow";
import DetailScreen from "./DetailScreen";
import TxDetailScreen from "./TxDetailScreen";
import { addr, invoke, view } from "../../lib/celerity";
import { friendlyError } from "../../lib/errors";
import { UNIT } from "../../lib/config";

// Seeded "recent recipients" so the cash-out forms aren't empty on stage.
// dest matches CashOutFlow destinations; detail is the number/account shown.
const SEED_RECIPIENTS = [
  { id: "seed-g1", dest: "gcash", detail: "09171234567", name: "Ramon Dela Cruz", label: "GCash" },
  { id: "seed-g2", dest: "gcash", detail: "09985550123", name: "Maria Santos", label: "GCash" },
  { id: "seed-b1", dest: "bank", detail: "001234567890", name: "Ramon Dela Cruz", label: "bank account", bank: "BDO" },
];

export default function FarmerApp({ pools, receipts, busy, setBusy, refresh, notify, onOpenDev }) {
  const [stage, setStage] = useState("splash"); // "splash" | "connect" | "app"
  const [page, setPage] = useState("home");
  const [overlay, setOverlay] = useState(null); // null | "cashout" | "programs" | "installments" | "region" | "help"
  const [registration, setRegistration] = useState(null);
  // Demo-only cash-out ledger. The chain is the source of truth for what
  // ARRIVED (receipts); these track what the farmer has cashed out locally so
  // the spendable balance can move live on stage. Clearly labeled "Demo" in UI.
  const [cashOuts, setCashOuts] = useState([]); // { id, units, php, destLabel, when, dest, detail, name }
  // Saved payout destinations shown as "recent recipients" on the cash-out
  // forms. Seeded so the list isn't empty on stage; real ones get appended.
  const [recipients, setRecipients] = useState(SEED_RECIPIENTS);
  const [txDetail, setTxDetail] = useState(null); // selected activity row, or null
  const cashOutSeq = useRef(0);
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

  const receivedUnits = receipts.reduce((sum, r) => sum + Number(BigInt(r.amount)) / Number(UNIT), 0);
  const cashedOutUnits = cashOuts.reduce((sum, c) => sum + c.units, 0);
  const availableUnits = Math.max(0, receivedUnits - cashedOutUnits);

  const recordCashOut = ({ units, php, destLabel, dest, detail, name }) => {
    cashOutSeq.current += 1;
    setCashOuts((prev) => [
      ...prev,
      { id: `co-${cashOutSeq.current}`, units, php, destLabel, dest, detail, name, when: Date.now() },
    ]);
    // Save/refresh this recipient at the top of the recents (dedupe by dest+detail).
    if (dest && detail) {
      setRecipients((prev) => {
        const key = `${dest}:${detail}`;
        const without = prev.filter((r) => `${r.dest}:${r.detail}` !== key);
        return [{ id: `rcp-${cashOutSeq.current}`, dest, detail, name: name || "", label: destLabel }, ...without];
      });
    }
    notify(`Cashed out to ${destLabel} ✓`);
  };

  // Fixed-height phone "screen": rounded, shadowed, clips its overflow so the
  // page content scrolls INSIDE it (bottom nav stays pinned) rather than the
  // browser page scrolling. On a real phone this is just the full viewport.
  const frameStyle = {
    width: "100%",
    maxWidth: 400,
    height: "100%",
    maxHeight: 880,
    background: "var(--paper-page)",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
    borderRadius: "clamp(0px, 4vw, 32px)",
    boxShadow: "0 24px 60px -18px rgba(22,69,45,0.28), 0 8px 20px -10px rgba(42,42,40,0.16)",
  };

  // Pre-app launch flow: opening splash → one-tap wallet confirm → the app.
  // Rendered inside the same phone frame so all stages share the 430px column.
  if (stage === "splash") {
    return (
      <div style={frameStyle}>
        <SplashScreen onDone={() => setStage("connect")} />
      </div>
    );
  }
  if (stage === "connect") {
    return (
      <div style={frameStyle}>
        <ConnectScreen me={me} farmerName={farmerName} onConnected={() => setStage("app")} onNotMe={() => setStage("splash")} />
      </div>
    );
  }

  const pageTitle = page === "home" ? null : page === "activity" ? "Activity" : "Profile";

  return (
    <div style={frameStyle}>
      {/* top bar: dove logo + a visible Funder button (presenter shortcut) */}
      <div style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src="/logo-dove.png" alt="Celerity" style={{ height: 26, width: "auto" }} />
          {pageTitle && <span style={{ font: "var(--text-h2)", fontSize: 17, color: "var(--text)" }}>{pageTitle}</span>}
        </div>
        <button onClick={onOpenDev} className="cel-press" style={funderBtnStyle} aria-label="Open funder console">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2.5 13.5h11M3.5 13.5v-6M12.5 13.5v-6M2 7.5 8 3l6 4.5M6.5 13.5v-3h3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Funder
        </button>
      </div>

      {/* scrollable content area — bottom nav stays pinned below */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {page === "home" && (
          <HomeScreen
            pools={pools}
            receipts={receipts}
            cashOuts={cashOuts}
            availableUnits={availableUnits}
            busy={busy}
            claim={claim}
            onCashOut={() => setOverlay("cashout")}
            onHistory={() => setPage("activity")}
            onDetail={(kind) => setOverlay(kind)}
            onOpenTx={setTxDetail}
          />
        )}
        {page === "activity" && (
          <ActivityScreen receipts={receipts} pools={pools} cashOuts={cashOuts} onOpenTx={setTxDetail} />
        )}
        {page === "profile" && (
          <ProfileScreen me={me} registration={registration} farmerName={farmerName} receipts={receipts} pools={pools} />
        )}
      </div>
      <BottomNav active={page} onNavigate={setPage} />

      {overlay === "cashout" && (
        <CashOutFlow
          availableUnits={availableUnits}
          recipients={recipients}
          onCashedOut={recordCashOut}
          onClose={() => setOverlay(null)}
        />
      )}
      {["programs", "installments", "region", "help"].includes(overlay) && (
        <DetailScreen kind={overlay} pools={pools} registration={registration} onBack={() => setOverlay(null)} />
      )}
      {txDetail && (
        <TxDetailScreen tx={txDetail} me={me} pools={pools} onBack={() => setTxDetail(null)} />
      )}
    </div>
  );
}

const topBarStyle = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 18px 6px",
};

const funderBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--container-highest)",
  background: "var(--surface)",
  color: "var(--text-dim)",
  borderRadius: 999,
  padding: "6px 12px",
  font: "var(--text-fine)",
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
