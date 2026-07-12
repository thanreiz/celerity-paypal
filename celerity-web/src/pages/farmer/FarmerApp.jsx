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
  // Session record of installments claimed in-app. The on-chain funder_ledger
  // is still the source of truth (refresh() re-reads it); this gives instant,
  // correctly-timed feedback — the activity row appears the moment a claim
  // succeeds, and its `when` starts the per-pool cooldown countdown, since the
  // contract doesn't expose last_ts to read the unlock time back.
  const [claims, setClaims] = useState([]); // { id, poolId, units, php, when }
  const claimSeq = useRef(0);
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
      // Record it now: drives the instant activity row + the cooldown timer.
      const pool = pools.find((p) => String(p.id) === String(poolId));
      const units = pool ? Number(BigInt(pool.payout_per_farmer)) / Number(UNIT) : 0;
      // Snapshot how many on-chain receipts this pool has RIGHT NOW (before the
      // claim's own receipt lands) — buildActivityRows uses this to know when
      // the claim's receipt has arrived, without depending on synthesized
      // timestamps. Fixes the first-claim-of-a-pool case, where settle_event's
      // auto-paid installment #1 would otherwise be mistaken for this claim.
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
  // Include claims still pending their on-chain receipt (same rule Activity
  // uses) so the hero balance moves the instant a claim's "Arriving" row
  // appears, instead of lagging ~1.5s behind until refresh() lands it.
  const pendingUnits = pendingClaims(claims, receipts).reduce((sum, c) => sum + c.units, 0);
  const cashedOutUnits = cashOuts.reduce((sum, c) => sum + c.units, 0);
  const availableUnits = Math.max(0, receivedUnits + pendingUnits - cashedOutUnits);

  // When each pool's next installment unlocks: the most recent in-app claim's
  // time + its claim_period. Only reflects claims made this session (the
  // contract doesn't expose last_ts), which is enough to show a live countdown
  // after the farmer claims and prevent an immediate "not due yet" error.
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
          <img src="/logo-dove.png" alt="Celerity" style={{ height: 30, width: "auto", display: "block" }} />
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
