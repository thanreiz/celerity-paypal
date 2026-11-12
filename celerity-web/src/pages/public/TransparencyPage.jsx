import React, { useEffect, useState } from "react";
import Card from "../../design/Card";
import Table from "../../design/Table";
import StatusPill from "../../design/StatusPill";
import Badge from "../../design/Badge";
import CountUp from "../../design/CountUp";
import Toast from "../../design/Toast";
import { PoolList } from "./Pools";
import { api } from "../../lib/api";
import { money, when, eventLabel, eventDetail, short, stormName } from "../../lib/format";
import { ChainStatus } from "../console/EvidencePage";

/** Public, no-login page: how much relief went out, for which storm, and
 * the hash-chained record behind it. No names or emails. */
// After PayPal Checkout the server sends the funder back to
// #/public?funded=<pool id>&amount=... (or cancelled / failed).
function fundedNotice() {
  const q = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const funded = q.get("funded");
  if (!funded) return null;
  if (funded === "cancelled") return { msg: "Payment cancelled. Nothing was charged." };
  if (funded === "failed" || funded === "unknown") return { msg: "PayPal didn't confirm that payment, so nothing was added.", error: true };
  return { poolId: funded, amount: Number(q.get("amount")) || 0 };
}

export default function TransparencyPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(fundedNotice);

  useEffect(() => {
    if (!notice) return undefined;
    // Drop the query so a reload doesn't show it again.
    window.history.replaceState(null, "", "#/public");
    const t = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    document.title = "Where the relief went · Celerity Relief";
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = () =>
      api
        .publicView()
        .then((d) => !cancelled && (setData(d), setError(null)))
        .catch((e) => !cancelled && setError(e.message))
        .finally(() => {
          if (!cancelled) timer = setTimeout(tick, 10000);
        });
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const sent = data?.storms.reduce((s, x) => s + x.sent, 0) || 0;
  const families = data?.storms.reduce((s, x) => s + x.families, 0) || 0;

  return (
    <div style={{ background: "var(--halo-soft), var(--paper-page)", minHeight: "100dvh" }}>
      <main className="cel-page cel-page--wide" style={{ paddingTop: 24 }}>
        <header className="cel-row-actions" style={{ justifyContent: "space-between" }}>
          <img src="/logo-lockup.png" alt="Celerity" style={{ height: 36, objectFit: "contain" }} />
          <a href="#/overview" style={{ font: "var(--text-meta)", fontWeight: 700, color: "var(--primary)" }}>
            Coordinator sign-in
          </a>
        </header>
        <div>
          <h1 style={{ font: "var(--text-display)", margin: 0, letterSpacing: "var(--tracking-tight)" }}>Where the relief went</h1>
          <p style={{ font: "var(--text-body)", color: "var(--text-dim)", margin: "6px 0 0", maxWidth: 680 }}>
            Celerity Relief sends typhoon cash aid through PayPal. Rules pay routine bulletins within fixed limits. When a bulletin is
            unclear, an AI agent drafts and a coordinator approves. Every step is written to a tamper-evident log you can check here.
          </p>
          {data?.paypalEnv === "sandbox" && (
            <div style={{ marginTop: 10 }}>
              <Badge stub>Demo: PayPal sandbox, simulated bulletins</Badge>
            </div>
          )}
        </div>

        {error && <p style={{ color: "var(--bad-text)" }}>{error}</p>}
        {!data && !error && (
          <p style={{ color: "var(--text-faint)" }}>
            <span className="cel-spin" /> Loading…
          </p>
        )}

        {data && (
          <>
            <div className="cel-kpis">
              {[
                ["Delivered", sent, (n) => money(n, data.currency)],
                ["Families reached", families, (n) => Math.round(n).toLocaleString()],
                ["Storms responded to", data.storms.length, (n) => Math.round(n).toLocaleString()],
                ["Families registered", data.registered, (n) => Math.round(n).toLocaleString()],
              ].map(([label, value, format], i) => (
                <div key={label} className={`cel-kpi cel-fade cel-fade-${i + 1}`}>
                  <span className="cel-section-label">{label}</span>
                  <span className="cel-kpi-value">
                    <CountUp value={value} format={format} />
                  </span>
                </div>
              ))}
            </div>

            <section className="cel-stack" style={{ gap: 12 }}>
              <div>
                <h2 style={{ font: "var(--text-h2)", margin: 0 }}>Who funds this</h2>
                <p style={{ font: "var(--text-meta)", color: "var(--text-dim)", margin: "4px 0 0", maxWidth: 680 }}>
                  Funders put money into pools earmarked for an area. When a storm hits, each payout is split across the pools that cover
                  that family, so every peso can be traced back to whoever gave it. Anyone can add to a pool through PayPal.
                </p>
              </div>
              <PoolList pools={data.pools} currency={data.currency} />
            </section>

            <Card title="Payout batches">
              <Table
                rowKey={(r) => r.id}
                emptyText="No relief has been sent yet."
                columns={[
                  { key: "storm", label: "Storm", render: (b) => <strong>{stormName(b.storm)}</strong> },
                  { key: "created_at", label: "Sent", render: (b) => when(b.created_at) },
                  { key: "recipients", label: "Delivered", num: true, render: (b) => `${b.delivered}/${b.recipients}` },
                  { key: "amount", label: "Amount", num: true, render: (b) => money(b.amount, data.currency) },
                  { key: "status", label: "PayPal", render: (b) => <StatusPill status={b.status} /> },
                ]}
                rows={data.batches}
              />
            </Card>

            <ChainStatus chain={data.chain} />

            <Card title="Latest record entries">
              <Table
                rowKey={(r) => r.id}
                emptyText="Nothing recorded yet."
                columns={[
                  { key: "seq", label: "#", num: true },
                  { key: "at", label: "When", render: (e) => <span style={{ whiteSpace: "nowrap" }}>{when(e.at)}</span> },
                  {
                    key: "type",
                    label: "Event",
                    render: (e) => (
                      <span>
                        <strong>{eventLabel(e.type)}</strong>
                        <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-dim)" }}>{eventDetail(e)}</span>
                      </span>
                    ),
                  },
                  { key: "actor", label: "Actor" },
                  {
                    key: "hash",
                    label: "Hash",
                    render: (e) => (
                      <span className="cel-mono" style={{ color: "var(--text-faint)" }}>
                        {short(e.hash)}
                      </span>
                    ),
                  },
                ]}
                rows={data.events.slice(0, 25)}
              />
            </Card>
          </>
        )}
      </main>
      {notice && (
        <Toast
          error={notice.error}
          message={
            notice.msg ||
            `Thank you. ${money(notice.amount, data?.currency || "PHP")} was added to ${
              data?.pools?.find((p) => p.id === notice.poolId)?.name || "the pool"
            } through PayPal.`
          }
        />
      )}
    </div>
  );
}
