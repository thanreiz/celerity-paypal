import React, { useCallback, useEffect, useRef, useState } from "react";
import SideNav from "../../design/SideNav";
import Toast from "../../design/Toast";
import Button from "../../design/Button";
import { api, session } from "../../lib/api";
import LoginScreen from "./LoginScreen";
import OverviewPage from "./OverviewPage";
import RespondPage from "./RespondPage";
import PayoutsPage from "./PayoutsPage";
import FamiliesPage from "./FamiliesPage";
import EvidencePage from "./EvidencePage";
import FundsPage from "./FundsPage";

const NAV = [
  { key: "overview", label: "Overview", desc: "Where relief stands" },
  { key: "funds", label: "Funds", desc: "Pools from funders", step: 1 },
  { key: "respond", label: "Respond", desc: "Bulletin in, agent drafts", step: 2 },
  { key: "payouts", label: "Payouts", desc: "PayPal status, live", step: 3 },
  { key: "families", label: "Families", desc: "Registered households" },
  { key: "evidence", label: "Evidence log", desc: "Hash-chained record" },
];

const PAGES = {
  overview: OverviewPage,
  funds: FundsPage,
  respond: RespondPage,
  payouts: PayoutsPage,
  families: FamiliesPage,
  evidence: EvidencePage,
};

const needsLoginTitle = (config, signedIn) => Boolean(config?.coordinatorKeyRequired && !signedIn);

// Poll fast while something is moving (agent run, PayPal batch in flight).
function pollDelay(data) {
  if (!data) return 3000;
  const busy =
    data.runs.some((r) => r.status === "running") ||
    data.batches.some((b) => ["SUBMITTING", "PENDING", "PROCESSING"].includes(b.status));
  return busy ? 1500 : 8000;
}

export default function Console({ route }) {
  const [config, setConfig] = useState(null);
  const [signedIn, setSignedIn] = useState(Boolean(session.key));
  const [loginError, setLoginError] = useState("");
  const [data, setData] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef(null);
  const dataRef = useRef(null);

  const page = PAGES[route.split("/")[0]] ? route.split("/")[0] : "overview";
  useEffect(() => {
    const label = needsLoginTitle(config, signedIn) ? "Sign in" : NAV.find((n) => n.key === page).label;
    document.title = `${label} · Celerity Relief`;
  }, [page, config, signedIn]);
  const go = useCallback((key) => {
    window.location.hash = `#/${key}`;
    window.scrollTo(0, 0);
  }, []);

  const notify = useCallback((msg, isError = false) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, isError });
    toastTimer.current = setTimeout(() => setToast(null), isError ? 10000 : 4500);
  }, []);

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch((e) => notify(e.message, true));
  }, [notify]);

  const needsLogin = config?.coordinatorKeyRequired && !signedIn;

  const refresh = useCallback(async () => {
    try {
      const next = await api.state();
      dataRef.current = next;
      setData(next);
    } catch (e) {
      if (e.status === 401 || e.status === 429) {
        session.signOut();
        setSignedIn(false);
        setLoginError(e.status === 429 ? e.message : "Your coordinator key is no longer accepted. Sign in again.");
      } else {
        throw e;
      }
    }
  }, [notify]);

  useEffect(() => {
    if (!config || needsLogin) return undefined;
    let cancelled = false;
    let timer;
    const tick = async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled && !dataRef.current) notify(e.message, true);
      }
      if (!cancelled) timer = setTimeout(tick, pollDelay(dataRef.current));
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [config, needsLogin, refresh, notify]);

  const act = useCallback(
    async (label, fn) => {
      setBusy(true);
      try {
        const result = await fn();
        if (label) notify(label);
        await refresh();
        return result;
      } catch (e) {
        const extra = e.body?.violations?.length
          ? ` (${e.body.violations.map((v) => `${v.family_id}: ${v.errors[0]}`).join("; ")})`
          : "";
        notify(`${e.message}${extra}`, true);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [refresh, notify]
  );

  if (!config) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", color: "var(--text-faint)" }}>
        Loading Celerity Relief…
        {toast && <Toast message={toast.msg} error={toast.isError} />}
      </div>
    );
  }

  if (needsLogin) {
    return (
      <LoginScreen
        initialError={loginError}
        onSignIn={async (key, name) => {
          session.signIn(key, name);
          try {
            const next = await api.state();
            dataRef.current = next;
            setData(next);
          } catch (e) {
            session.signOut();
            if (e.status === 401) return "That key wasn't accepted. Check it with your relief office.";
            return e.message;
          }
          clearTimeout(toastTimer.current);
          setToast(null);
          setLoginError("");
          setSignedIn(true);
          return "";
        }}
      />
    );
  }

  const Page = PAGES[page];
  const pendingApprovals = data?.runs.filter((r) => r.status === "awaiting_approval").length || 0;
  const navItems = NAV.map((n) =>
    n.key === "respond" && pendingApprovals ? { ...n, desc: `${pendingApprovals} waiting for approval` } : n
  );

  return (
    <div className="cel-console">
      <div className="cel-console-side">
        <SideNav
          items={navItems}
          active={page}
          onNavigate={go}
          footer={
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ font: "var(--text-meta)", fontWeight: 700 }}>{session.name || "Coordinator"}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href="#/public" style={{ font: "var(--text-fine)", color: "var(--primary)" }}>
                  Public view
                </a>
                {config.coordinatorKeyRequired && (
                  <button
                    onClick={() => {
                      session.signOut();
                      setSignedIn(false);
                    }}
                    style={{ font: "var(--text-fine)", color: "var(--text-faint)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    Sign out
                  </button>
                )}
              </div>
            </div>
          }
        />
      </div>
      <div className="cel-console-main">
        <nav className="cel-console-tabs" aria-label="Sections">
          {navItems.map((n) => (
            <button key={n.key} className={n.key === page ? "is-active" : ""} aria-current={n.key === page ? "page" : undefined} onClick={() => go(n.key)}>
              {n.label}
              {n.key === "respond" && pendingApprovals ? ` (${pendingApprovals})` : ""}
            </button>
          ))}
          <button onClick={() => (window.location.hash = "#/public")}>Public view</button>
        </nav>
        {data ? (
          <Page key={page} data={data} config={config} act={act} busy={busy} go={go} notify={notify} />
        ) : (
          <div className="cel-page" style={{ paddingTop: 40, color: "var(--text-faint)" }}>
            <span>
              <span className="cel-spin" /> Loading console…
            </span>
            <Button variant="ghost" size="sm" onClick={() => refresh().catch((e) => notify(e.message, true))}>
              Retry
            </Button>
          </div>
        )}
      </div>
      {toast && <Toast message={toast.msg} error={toast.isError} />}
    </div>
  );
}
