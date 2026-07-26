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
import CoachTour from "../../design/CoachTour";
import { addr, invoke, view } from "../../lib/celerity";
import { friendlyError } from "../../lib/errors";
import { UNIT } from "../../lib/config";
import { toPHPNumber } from "../../lib/anchor";
import { pendingClaims } from "../../lib/activityRows";
import { demoFarmerByRole, DEMO_FARMERS } from "../../lib/farmers";
import { loadCashOuts, saveCashOuts, loadRecipients, saveRecipients, resetDemoState } from "../../lib/farmerDemoState";
import {
  loadClaimCooldowns,
  saveClaimCooldowns,
  clearClaimCooldowns,
  unlockAfterPeriod,
  isClaimNotDueYet,
} from "../../lib/claimCooldown";
import { FARMER_TOUR, isTourDone, completeTour, resetTour } from "../../lib/tours";

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
  const frameRef = useRef(null);
  const [showTour, setShowTour] = useState(() => !isTourDone("farmer"));
  const [claimCooldowns, setClaimCooldowns] = useState(() => loadClaimCooldowns(farmerRole));
  // Baseline receipt counts so the first load doesn't fake a brand-new settle.
  // Only *increases* after that seed the unlock timer (settle / later claims).
  const receiptCountsReady = useRef(false);
  const receiptCountsRef = useRef({});

  // Reload local demo ledgers when View-as switches identity.
  useEffect(() => {
    const seeds = seedRecipientsFor(identity.name);
    setCashOuts(loadCashOuts(farmerRole));
    setRecipients(loadRecipients(seeds, farmerRole));
    setClaims([]);
    setClaimCooldowns(loadClaimCooldowns(farmerRole));
    setTxDetail(null);
    setOverlay(null);
    setPage("home");
    claimSeq.current = 0;
    cashOutSeq.current = 0;
    receiptCountsReady.current = false;
    receiptCountsRef.current = {};
  }, [farmerRole, identity.name]);

  useEffect(() => saveClaimCooldowns(claimCooldowns, farmerRole), [claimCooldowns, farmerRole]);

  // When settle (or a claim refresh) adds receipts for a recurring pool, start
  // the same countdown Home already renders — don't wait for a failed Claim tap.
  useEffect(() => {
    const counts = {};
    for (const r of receipts) {
      const k = String(r.pool_id);
      counts[k] = (counts[k] || 0) + 1;
    }
    if (!receiptCountsReady.current) {
      receiptCountsRef.current = counts;
      receiptCountsReady.current = true;
      return;
    }
    setClaimCooldowns((prev) => {
      let next = prev;
      let changed = false;
      for (const [poolId, count] of Object.entries(counts)) {
        const before = receiptCountsRef.current[poolId] || 0;
        if (count <= before) continue;
        const pool = pools.find((p) => String(p.id) === poolId);
        if (!pool || Number(pool.installments) <= 1) continue;
        next = unlockAfterPeriod(next, poolId, pool.claim_period_secs);
        changed = true;
      }
      receiptCountsRef.current = counts;
      return changed ? next : prev;
    });
  }, [receipts, pools]);

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
      const paidAt = Date.now();
      claimSeq.current += 1;
      setClaims((prev) => [
        ...prev,
        { id: `cl-${claimSeq.current}`, poolId: String(poolId), units, php: toPHPNumber(units), when: paidAt, receiptCountAtClaim },
      ]);
      if (pool) {
        setClaimCooldowns((prev) => unlockAfterPeriod(prev, poolId, pool.claim_period_secs, paidAt));
      }
      notify("Installment claimed ✓");
      await new Promise((r) => setTimeout(r, 1500));
      await refresh();
    } catch (e) {
      // Contract still gating — show the countdown instead of a red error toast.
      if (isClaimNotDueYet(e)) {
        const pool = pools.find((p) => String(p.id) === String(poolId));
        if (pool) {
          setClaimCooldowns((prev) => unlockAfterPeriod(prev, poolId, pool.claim_period_secs));
        }
        return;
      }
      notify(`Claim: ${friendlyError(e)}`, true);
    } finally {
      setBusy(false);
    }
  };

  const receivedUnits = receipts.reduce((sum, r) => sum + Number(BigInt(r.amount)) / Number(UNIT), 0);
  const pendingUnits = pendingClaims(claims, receipts).reduce((sum, c) => sum + c.units, 0);
  const cashedOutUnits = cashOuts.reduce((sum, c) => sum + c.units, 0);
  // Optional ?shotBalance=N boosts available units for screenshot tooling only.
  const shotBalance = (() => {
    try {
      const n = Number(new URLSearchParams(window.location.search).get("shotBalance") || 0);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  })();
  const availableUnits = Math.max(0, receivedUnits + pendingUnits - cashedOutUnits) + shotBalance;

  const nextClaimAtByPool = {};
  for (const [poolId, cool] of Object.entries(claimCooldowns)) {
    if (!cool?.unlockAt) continue;
    nextClaimAtByPool[poolId] = { unlockAt: cool.unlockAt, claimedAt: cool.paidAt || 0 };
  }
  for (const c of claims) {
    const pool = pools.find((p) => String(p.id) === String(c.poolId));
    if (!pool) continue;
    const unlockAt = c.when + Number(pool.claim_period_secs) * 1000;
    const key = String(c.poolId);
    if (!(key in nextClaimAtByPool) || unlockAt > nextClaimAtByPool[key].unlockAt) {
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
    clearClaimCooldowns(farmerRole);
    setClaimCooldowns({});
    setCashOuts([]);
    setRecipients(seedRecipientsFor(farmerName));
    notify("Demo wallet reset — cash-out history cleared");
  };

  const handleSwitch = (role) => {
    if (role === farmerRole || !onSwitchFarmer) return;
    onSwitchFarmer(role);
    // Stay on connect so the identity card updates; the top View-as switch
    // already shows who — no toast covering the tab bar on camera.
    setStage("connect");
  };

  const endTour = () => {
    completeTour("farmer");
    setShowTour(false);
  };

  const replayTour = () => {
    resetTour("farmer");
    setPage("home");
    setShowTour(true);
  };

  const frameClass = "cel-farmer-shell";

  if (stage === "splash") {
    return (
      <div className={frameClass}>
        <SplashScreen onDone={() => setStage("connect")} />
      </div>
    );
  }
  if (stage === "connect") {
    return (
      <div className={frameClass}>
        <ConnectScreen
          me={me}
          farmerName={farmerName}
          region={identity.region}
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
  // Full-screen overlays (Quick help details, cash-out, tx detail) own the
  // whole shell — the tab bar must not show under them. The coach tour needs
  // the bar (it spotlights the Activity/Profile tabs) but only runs when no
  // overlay is open, so this guard never hides it mid-tour.
  const overlayUp = Boolean(overlay) || Boolean(txDetail);

  return (
    <div ref={frameRef} className={frameClass}>
      {overlayUp ? (
        <div className="cel-farmer-overlay-host">
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
      ) : (
        <>
          <div className="cel-farmer-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <img src="/logo-dove.png" alt="Celerity" style={{ height: 28, width: "auto", display: "block", flexShrink: 0 }} />
              {pageTitle && <span style={{ font: "var(--text-h2)", fontSize: 17, color: "var(--text)" }}>{pageTitle}</span>}
            </div>
            <div className="cel-farmer-topbar-actions">
              <ViewAsSwitch activeRole={farmerRole} onSwitch={handleSwitch} />
              <button onClick={onOpenDev} className="cel-press" style={funderBtnStyle} aria-label="Open funder console">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2.5 13.5h11M3.5 13.5v-6M12.5 13.5v-6M2 7.5 8 3l6 4.5M6.5 13.5v-3h3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="cel-funder-chip-label">Funder</span>
              </button>
            </div>
          </div>

          <div className="cel-farmer-scroll">
            <div key={page} className="cel-screen">
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
                <ProfileScreen
                  me={me}
                  registration={registration}
                  farmerName={farmerName}
                  receipts={receipts}
                  pools={pools}
                  onResetDemo={resetDemo}
                  onReplayTour={replayTour}
                />
              )}
            </div>
          </div>
          <BottomNav active={page} onNavigate={setPage} />

          {showTour && page === "home" && (
            <CoachTour steps={FARMER_TOUR} rootRef={frameRef} onComplete={endTour} onSkip={endTour} />
          )}
        </>
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
            className="cel-press cel-chip"
            style={{
              border: "none",
              borderRadius: 999,
              padding: "7px 10px",
              minHeight: 32,
              font: "var(--text-fine)",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              background: on ? "var(--primary)" : "transparent",
              color: on ? "var(--on-primary)" : "var(--text-dim)",
              transition: "background-color var(--transition-base), color var(--transition-base), transform var(--transition-fast)",
            }}
          >
            {f.shortName}
          </button>
        );
      })}
    </div>
  );
}

const funderBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--container-highest)",
  background: "var(--surface)",
  color: "var(--text-dim)",
  borderRadius: 999,
  padding: "8px 12px",
  minHeight: 36,
  font: "var(--text-fine)",
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  flexShrink: 0,
};
