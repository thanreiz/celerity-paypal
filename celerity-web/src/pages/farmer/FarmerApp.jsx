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
import { toPHPNumber } from "../../lib/anchor";
import { pendingClaims } from "../../lib/activityRows";
import { demoFarmerByRole, DEMO_FARMERS } from "../../lib/farmers";
import { loadCashOuts, saveCashOuts, loadRecipients, saveRecipients, resetDemoState } from "../../lib/farmerDemoState";

function seedRecipientsFor(name) {
  return [
    { id: "seed-g1", dest: "gcash", detail: "09171234567", name, label: "GCash" },
    { id: "seed-g2", dest: "gcash", detail: "09985550123", name: "Maria Santos", label: "GCash" },
    { id: "seed-b1", dest: "bank", detail: "001234567890", name, label: "bank account", bank: "BDO" },
  ];
}

export default function FarmerApp({
  farmerRole = "farmer",
  onSwitchFarmer,
  pools,
  receipts,
  busy,
  setBusy,
  refresh,
  notify,
  onOpenDev,
}) {
  const identity = demoFarmerByRole(farmerRole) || DEMO_FARMERS[0];
  const me = addr(identity.role);
  const farmerName = identity.name;
  const seedRecipients = seedRecipientsFor(farmerName);

  const [stage, setStage] = useState("splash"); // "splash" | "connect" | "app"
  const [page, setPage] = useState("home");
  const [overlay, setOverlay] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [cashOuts, setCashOuts] = useState(() => loadCashOuts(farmerRole));
  const [claims, setClaims] = useState([]);
  const claimSeq = useRef(0);
  const [recipients, setRecipients] = useState(() => loadRecipients(seedRecipients, farmerRole));
  const [txDetail, setTxDetail] = useState(null);
  const cashOutSeq = useRef(0);

  // Reload local demo ledgers when View-as switches identity.
  useEffect(() => {
    const seeds = seedRecipientsFor(identity.name);
    setCashOuts(loadCashOuts(farmerRole));
    setRecipients(loadRecipients(seeds, farmerRole));
    setClaims([]);
    setTxDetail(null);
    setOverlay(null);
    setPage("home");
    claimSeq.current = 0;
    cashOutSeq.current = 0;
  }, [farmerRole, identity.name]);

  useEffect(() => {
    view("farmer", { addr: me }).then(setRegistration).catch(() => setRegistration(null));
  }, [me, pools]);

  useEffect(() => saveCashOuts(cashOuts, farmerRole), [cashOuts, farmerRole]);
  useEffect(() => saveRecipients(recipients, farmerRole), [recipients, farmerRole]);

  const claim = async (poolId) => {
    setBusy(true);
    try {
      await invoke(identity.role, "claim", { farmer: me, pool_id: poolId });
      const pool = pools.find((p) => String(p.id) === String(poolId));
      const units = pool ? Number(BigInt(pool.payout_per_farmer)) / Number(UNIT) : 0;
      const receiptCountAtClaim = receipts.filter((r) => String(r.pool_id) === String(poolId)).length;
      claimSeq.current += 1;
      setClaims((prev) => [
        ...prev,
        { id: `cl-${claimSeq.current}`, poolId: String(poolId), units, php: toPHPNumber(units), when: Date.now(), receiptCountAtClaim },
      ]);
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
  const pendingUnits = pendingClaims(claims, receipts).reduce((sum, c) => sum + c.units, 0);
  const cashedOutUnits = cashOuts.reduce((sum, c) => sum + c.units, 0);
  const availableUnits = Math.max(0, receivedUnits + pendingUnits - cashedOutUnits);

  const nextClaimAtByPool = {};
  for (const c of claims) {
    const pool = pools.find((p) => String(p.id) === String(c.poolId));
    if (!pool) continue;
    const unlockAt = c.when + Number(pool.claim_period_secs) * 1000;
    const key = String(c.poolId);
    if (!(key in nextClaimAtByPool) || c.when > nextClaimAtByPool[key].claimedAt) {
      nextClaimAtByPool[key] = { unlockAt, claimedAt: c.when };
    }
  }

  const recordCashOut = ({ units, php, destLabel, dest, detail, name }) => {
    cashOutSeq.current += 1;
    setCashOuts((prev) => [
      ...prev,
      { id: `co-${cashOutSeq.current}`, units, php, destLabel, dest, detail, name, when: Date.now() },
    ]);
    if (dest && detail) {
      setRecipients((prev) => {
        const key = `${dest}:${detail}`;
        const without = prev.filter((r) => `${r.dest}:${r.detail}` !== key);
        return [{ id: `rcp-${cashOutSeq.current}`, dest, detail, name: name || "", label: destLabel }, ...without];
      });
    }
    notify(`Cashed out to ${destLabel} ✓`);
  };

  const resetDemo = () => {
    resetDemoState(farmerRole);
    setCashOuts([]);
    setRecipients(seedRecipientsFor(farmerName));
    notify("Demo wallet reset — cash-out history cleared");
  };

  const handleSwitch = (role) => {
    if (role === farmerRole || !onSwitchFarmer) return;
    onSwitchFarmer(role);
    setStage("connect");
    notify(`Viewing as ${demoFarmerByRole(role)?.name || role}`);
  };

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
        <ConnectScreen
          me={me}
          farmerName={farmerName}
          farmers={DEMO_FARMERS}
          activeRole={farmerRole}
          onSwitchFarmer={handleSwitch}
          onConnected={() => setStage("app")}
          onNotMe={() => setStage("splash")}
        />
      </div>
    );
  }

  const pageTitle = page === "home" ? null : page === "activity" ? "Activity" : "Profile";

  return (
    <div style={frameStyle}>
      <div style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src="/logo-dove.png" alt="Celerity" style={{ height: 30, width: "auto", display: "block" }} />
          {pageTitle && <span style={{ font: "var(--text-h2)", fontSize: 17, color: "var(--text)" }}>{pageTitle}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ViewAsSwitch activeRole={farmerRole} onSwitch={handleSwitch} />
          <button onClick={onOpenDev} className="cel-press" style={funderBtnStyle} aria-label="Open funder console">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2.5 13.5h11M3.5 13.5v-6M12.5 13.5v-6M2 7.5 8 3l6 4.5M6.5 13.5v-3h3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Funder
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {page === "home" && (
          <HomeScreen
            farmerShortName={identity.shortName}
            pools={pools}
            receipts={receipts}
            cashOuts={cashOuts}
            claims={claims}
            nextClaimAtByPool={nextClaimAtByPool}
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
          <ActivityScreen receipts={receipts} pools={pools} cashOuts={cashOuts} claims={claims} onOpenTx={setTxDetail} />
        )}
        {page === "profile" && (
          <ProfileScreen me={me} registration={registration} farmerName={farmerName} receipts={receipts} pools={pools} onResetDemo={resetDemo} />
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

function ViewAsSwitch({ activeRole, onSwitch }) {
  return (
    <div
      role="group"
      aria-label="View as farmer"
      style={{
        display: "inline-flex",
        background: "var(--container)",
        borderRadius: 999,
        padding: 2,
        gap: 2,
      }}
    >
      {DEMO_FARMERS.map((f) => {
        const on = f.role === activeRole;
        return (
          <button
            key={f.role}
            type="button"
            onClick={() => onSwitch(f.role)}
            className="cel-press"
            style={{
              border: "none",
              borderRadius: 999,
              padding: "5px 10px",
              font: "var(--text-fine)",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              background: on ? "var(--primary)" : "transparent",
              color: on ? "var(--on-primary)" : "var(--text-dim)",
            }}
          >
            {f.shortName}
          </button>
        );
      })}
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
