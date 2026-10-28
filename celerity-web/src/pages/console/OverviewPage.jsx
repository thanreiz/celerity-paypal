import React from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import CountUp from "../../design/CountUp";
import StatusPill from "../../design/StatusPill";
import { money, when, eventLabel, eventDetail } from "../../lib/format";
import { PageHeader, SystemStatus, Label } from "./parts";

const STEPS = [
  ["Bulletin arrives", "A typhoon bulletin is pasted in or picked from the feed."],
  ["Agent drafts", "Claude reads it, finds families in signal areas, and drafts payouts. Code enforces every cap."],
  ["Human approves", "A coordinator reviews each draft and its reason, then approves or rejects the run."],
  ["PayPal pays", "Payouts sends the money. Webhooks update each family's status here."],
];

export default function OverviewPage({ data, config, go }) {
  const currency = config.policy.currency;
  const items = data.batches.flatMap((b) => b.items);
  const delivered = items.filter((i) => i.status === "SUCCESS");
  const inFlight = items.filter((i) => ["PENDING", "UNCLAIMED", "ONHOLD"].includes(i.status));
  const waiting = data.runs.filter((r) => r.status === "awaiting_approval");
  const active = data.families.filter((f) => f.status === "active").length;

  const kpis = [
    ["Families registered", active, (n) => Math.round(n).toLocaleString()],
    ["Delivered via PayPal", delivered.reduce((s, i) => s + i.amount, 0), (n) => money(n, currency)],
    ["Families paid", delivered.length, (n) => Math.round(n).toLocaleString()],
    ["In flight", inFlight.reduce((s, i) => s + i.amount, 0), (n) => money(n, currency)],
  ];

  return (
    <main className="cel-page cel-page--wide">
      <PageHeader title="Overview" lede="An AI agent drafts typhoon cash aid within hard limits. A person approves it. PayPal delivers it.">
        <SystemStatus config={config} />
      </PageHeader>

      {waiting.length > 0 && (
        <Card variant="notice">
          <div className="cel-row-actions" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{waiting.length === 1 ? "1 agent run needs" : `${waiting.length} agent runs need`} your approval</strong>
              <p style={{ font: "var(--text-meta)", color: "var(--text-dim)", margin: "2px 0 0" }}>
                {waiting
                  .map((r) => `${r.storm}: ${r.totals.recipients} families, ${money(r.totals.amount, currency)}`)
                  .join(" · ")}
              </p>
            </div>
            <Button variant="outline" onClick={() => go("respond")}>
              Review drafts
            </Button>
          </div>
        </Card>
      )}

      <div className="cel-kpis">
        {kpis.map(([label, value, format], i) => (
          <div key={label} className={`cel-kpi cel-fade cel-fade-${i + 1}`}>
            <span className="cel-section-label">{label}</span>
            <span className="cel-kpi-value">
              <CountUp value={value} format={format} />
            </span>
          </div>
        ))}
      </div>

      <Card title="How a response works">
        <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {STEPS.map(([title, body], i) => (
            <li key={title} style={{ display: "flex", gap: 12 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  color: "#fff",
                  display: "inline-grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span>
                <strong style={{ display: "block" }}>{title}</strong>
                <span style={{ font: "var(--text-meta)", color: "var(--text-dim)" }}>{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="cel-row-actions" style={{ marginTop: 18 }}>
          <Button variant="outline" onClick={() => go("respond")}>
            Respond to a bulletin
          </Button>
          <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>
            Limits: up to {money(config.policy.maxPerFamily, currency)} per family, {money(config.policy.maxPerRun, currency)} and{" "}
            {config.policy.maxRecipientsPerRun} families per run, signal {config.policy.minSignal}+ only.
          </span>
        </div>
      </Card>

      <Card title="Latest batches">
        {data.batches.length === 0 ? (
          <p style={{ color: "var(--text-faint)" }}>No payouts yet. Approve an agent run to send the first batch.</p>
        ) : (
          <div className="cel-stack" style={{ gap: 10 }}>
            {data.batches.slice(0, 4).map((b) => {
              const ok = b.items.filter((i) => i.status === "SUCCESS").length;
              return (
                <button
                  key={b.id}
                  className="cel-bulletin-pick cel-press"
                  onClick={() => go("payouts")}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                >
                  <span>
                    <strong>{b.storm}</strong>
                    <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-faint)" }}>
                      {ok}/{b.items.length} delivered · {money(b.items.reduce((s, i) => s + i.amount, 0), currency)} · {when(b.created_at)}
                    </span>
                  </span>
                  <StatusPill status={b.status} />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Recent activity">
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {data.events.slice(0, 8).map((e) => (
            <li key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, font: "var(--text-meta)" }}>
              <span style={{ minWidth: 0 }}>
                <strong>{eventLabel(e.type)}</strong>{" "}
                <span style={{ color: "var(--text-dim)", overflowWrap: "anywhere" }}>{eventDetail(e)}</span>
              </span>
              <span style={{ color: "var(--text-faint)", whiteSpace: "nowrap" }}>{when(e.at)}</span>
            </li>
          ))}
          {data.events.length === 0 && <li style={{ color: "var(--text-faint)" }}>Nothing has happened yet.</li>}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => go("evidence")} style={{ marginTop: 8, paddingLeft: 0 }}>
          Open the evidence log
        </Button>
      </Card>
      <Label>Celerity Relief · PayPal {config.paypalEnv}</Label>
    </main>
  );
}
