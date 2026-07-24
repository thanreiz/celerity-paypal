import React, { useEffect, useRef, useState } from "react";
import LoginScreen from "./LoginScreen";
import FunderHome from "./FunderHome";
import PoolsPage from "./PoolsPage";
import FarmersPage from "./FarmersPage";
import LedgerPage from "./LedgerPage";
import SettingsPage from "./SettingsPage";
import OraclePage from "./OraclePage";
import CreatePoolModal from "./CreatePoolModal";
import CoachTour from "../../design/CoachTour";
import { addr, farmersByRegion, view } from "../../lib/celerity";
import { FUNDERS, funderByRole } from "../../lib/funders";
import { short, CONTRACT_ID } from "../../lib/config";
import { FUNDER_TOUR, isTourDone, completeTour, resetTour } from "../../lib/tours";

const TITLES = {
  pools: "Escrow Pools",
  farmers: "Farmers Registry",
  ledger: "Ledger",
  oracle: "Trigger Typhoon",
  settings: "Settings",
};

// One plain-language sentence per page — what am I looking at?
const SUBTITLES = {
  pools: "Only your pools — each funder controls exactly what they deployed, nothing else.",
  farmers: "The LGU maintains this list with the admin key — funders can look, not touch.",
  ledger: "Every release your pools ever made, per farmer, on-chain.",
  oracle: "Load a signed weather bulletin — every matching region settles in one pass.",
  settings: "Demo identities and contract details.",
};

function AvatarButton({ initials, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="cel-press"
      style={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        border: "none",
        background: "var(--primary)",
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        flexShrink: 0,
      }}
    >
      {initials}
    </button>
  );
}

function MiniButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="cel-press"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        border: "1px solid var(--container-highest)",
        background: "var(--surface)",
        color: "var(--text-dim)",
        borderRadius: 999,
        padding: "8px 14px",
        font: "var(--text-fine)",
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function FunderPortal({ pools, loaded, busy, run, refresh, onBackToFarmer, onOpenPublic }) {
  const [who, setWho] = useState(null); // null → institution picker
  const [page, setPage] = useState("home");
  const [showCreate, setShowCreate] = useState(false);
  const [ledger, setLedger] = useState([]);
  const [farmerGroups, setFarmerGroups] = useState([]);
  // Active typhoon context, set by the oracle page after a bulletin loads —
  // the pools dashboard renders it as a temporary overlay.
  const [bulletin, setBulletin] = useState(null);
  const portalRef = useRef(null);
  const [showTour, setShowTour] = useState(false);

  const me = who ? addr(who) : null;
  const identity = who ? funderByRole(who) : null;
  // Strict isolation: every funder-scoped surface renders from this list only.
  const myPools = who ? pools.filter((p) => p.funder === me) : [];
  const farmerCount = farmerGroups.reduce((n, g) => n + g.list.length, 0);

  useEffect(() => {
    if (!who) return;
    // First login to an institution — show coach tips once per browser.
    if (!isTourDone("funder")) {
      setPage("home");
      setShowTour(true);
    }
  }, [who]);

  useEffect(() => {
    if (!me) return;
    view("funder_ledger", { funder: me }).then(setLedger).catch(() => setLedger([]));
  }, [me, pools]);

  useEffect(() => {
    farmersByRegion(pools).then(setFarmerGroups).catch(() => setFarmerGroups([]));
  }, [pools]);

  const endTour = () => {
    completeTour("funder");
    setShowTour(false);
  };

  const replayTour = () => {
    resetTour("funder");
    setPage("home");
    setShowTour(true);
  };

  if (!who) {
    return (
      <LoginScreen
        onLogin={(role) => {
          setWho(role);
          setPage("home");
        }}
        onBackToFarmer={onBackToFarmer}
      />
    );
  }

  const switchTo = (role) => {
    if (role !== who) setWho(role); // ledger + pools re-scope via effects
  };

  const corner = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {page === "home" && (
        <>
          <MiniButton onClick={onBackToFarmer}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" />
            </svg>
            Farmer App
          </MiniButton>
          <MiniButton onClick={onOpenPublic}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" /><path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
            Public Ledger
          </MiniButton>
        </>
      )}
      <AvatarButton initials={identity.initials} title="Switch institution" onClick={() => setWho(null)} />
    </div>
  );

  return (
    <div ref={portalRef} style={{ minHeight: "100dvh", background: "var(--bg-page)", fontFamily: "var(--font-sans)", position: "relative" }}>
      {/* corner header — replaces the old top strip and sidebar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          padding: "18px 28px 0",
          flexWrap: "wrap",
          maxWidth: 1120,
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {page === "home" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--primary)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {identity.initials}
            </span>
            <div>
              <div style={{ font: "var(--text-body-lg)", fontWeight: 700, color: "var(--text)" }}>{identity.label}</div>
              <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
                {short(me)} · Stellar Testnet ·{" "}
                <a
                  href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--primary)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  contract {short(CONTRACT_ID)} ↗
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setPage("home")}
              aria-label="Back to home"
              className="cel-press"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "1px solid var(--container-highest)",
                background: "var(--surface)",
                color: "var(--text-dim)",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 style={{ margin: 0, font: "var(--text-h2)", fontSize: 22, color: "var(--text)" }}>{TITLES[page]}</h2>
              <div style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>{SUBTITLES[page]}</div>
            </div>
          </div>
        )}
        {corner}
      </div>

      <div style={{ height: 20 }} />

      {/* Keying on `page` remounts the body on every navigation, so the
          cel-swap entrance replays each time the funder changes screens. */}
      <div key={page} className="cel-swap">
        {page === "home" && (
          <FunderHome
            myPools={myPools}
            loaded={loaded}
            ledger={ledger}
            farmerCount={farmerCount}
            onGoto={setPage}
            onCreatePool={() => setShowCreate(true)}
            onReplayTour={replayTour}
          />
        )}
        {page === "pools" && (
          <PoolsPage
            myPools={myPools}
            loaded={loaded}
            ledger={ledger}
            bulletin={bulletin}
            who={who}
            me={me}
            busy={busy}
            run={run}
            onCreatePool={() => setShowCreate(true)}
            onSwitchWho={switchTo}
            onGoto={setPage}
          />
        )}
        {page === "farmers" && <FarmersPage groups={farmerGroups} busy={busy} run={run} />}
        {page === "ledger" && <LedgerPage ledger={ledger} pools={myPools} />}
        {page === "oracle" && (
          <OraclePage pools={pools} myPools={myPools} who={who} busy={busy} run={run} refresh={refresh} onBulletin={setBulletin} />
        )}
        {page === "settings" && <SettingsPage who={who} me={me} funders={[...new Set(pools.map((p) => p.funder))]} />}
      </div>

      {showTour && page === "home" && !showCreate && (
        <CoachTour steps={FUNDER_TOUR} rootRef={portalRef} onComplete={endTour} onSkip={endTour} />
      )}

      {showCreate && <CreatePoolModal onClose={() => setShowCreate(false)} who={who} me={me} busy={busy} run={run} />}
    </div>
  );
}
