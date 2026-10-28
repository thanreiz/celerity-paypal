import React, { useMemo, useState } from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import Input from "../../design/Input";
import Table from "../../design/Table";
import StatusPill from "../../design/StatusPill";
import Badge from "../../design/Badge";
import { api } from "../../lib/api";
import { money, when, clock, flagList } from "../../lib/format";
import { PageHeader, Label } from "./parts";

const TOOL_LABELS = {
  record_bulletin_facts: "Read the bulletin",
  search_families: "Searched the registry",
  check_eligibility: "Checked eligibility",
  draft_payout: "Drafted payout",
  remove_draft: "Removed draft",
};

function describeInput(step, familiesById) {
  const i = step.input || {};
  switch (step.tool) {
    case "search_families":
      return [i.municipality, i.province].filter(Boolean).join(", ");
    case "check_eligibility":
      return `${i.family_ids?.length || 0} families`;
    case "draft_payout":
    case "remove_draft":
      return familiesById[i.family_id]?.name || i.family_id;
    default:
      return "";
  }
}

function Trace({ run, familiesById }) {
  if (!run.steps.length && run.status === "running") {
    return (
      <p style={{ color: "var(--text-faint)", font: "var(--text-meta)" }}>
        <span className="cel-spin" /> The agent is reading the bulletin…
      </p>
    );
  }
  return (
    <ol className="cel-trace">
      {run.steps.map((s, i) =>
        s.kind === "note" ? (
          <li key={i}>
            <span className="cel-trace-dot" style={{ background: "var(--surface-low)", color: "var(--text-faint)" }}>
              …
            </span>
            <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>{s.text}</span>
          </li>
        ) : (
          <li key={i}>
            <span
              className="cel-trace-dot"
              style={{
                background: s.ok ? "var(--ok-bg)" : "var(--bad-bg)",
                color: s.ok ? "var(--ok-text)" : "var(--bad-text)",
              }}
              aria-label={s.ok ? "accepted" : "refused by policy"}
            >
              {s.ok ? "✓" : "✕"}
            </span>
            <span style={{ minWidth: 0 }}>
              <strong>{TOOL_LABELS[s.tool] || s.tool}</strong>
              {describeInput(s, familiesById) && <span style={{ color: "var(--text-dim)" }}> · {describeInput(s, familiesById)}</span>}
              <span style={{ display: "block", color: s.ok ? "var(--text-faint)" : "var(--bad-text)", overflowWrap: "anywhere" }}>
                {!s.ok && "Refused by policy: "}
                {s.result}
              </span>
            </span>
          </li>
        )
      )}
      {run.status === "running" && (
        <li>
          <span className="cel-trace-dot">
            <span className="cel-spin" />
          </span>
          <span style={{ color: "var(--text-faint)" }}>Working…</span>
        </li>
      )}
    </ol>
  );
}

function RunCard({ run, data, config, act, busy, go, latest }) {
  const [open, setOpen] = useState(latest);
  const currency = config.policy.currency;
  const familiesById = useMemo(() => Object.fromEntries(data.families.map((f) => [f.id, f])), [data.families]);
  const refused = run.steps.filter((s) => s.kind === "tool" && !s.ok).length;

  const approve = () => {
    const ok = window.confirm(
      `Send ${money(run.totals.amount, currency)} to ${run.totals.recipients} families through PayPal ${config.paypalEnv}?\n\nThis cannot be undone from Celerity.`
    );
    if (ok) act("Approved. PayPal is processing the batch.", () => api.approveRun(run.id)).then(() => go("payouts"), () => {});
  };
  const reject = () => {
    const reason = window.prompt("Why are you rejecting this run? (optional)", "");
    if (reason !== null) act("Run rejected. Nothing was sent.", () => api.rejectRun(run.id, reason)).catch(() => {});
  };

  return (
    <Card>
      <div className="cel-row-actions" style={{ justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ font: "var(--text-h2)" }}>{run.storm || "Agent run"}</strong>
          <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-faint)" }}>
            Started {when(run.started_at)} by {run.started_by} · {run.model}
            {run.usage?.output_tokens ? ` · ${(run.usage.input_tokens + run.usage.output_tokens).toLocaleString()} tokens` : ""}
          </span>
        </div>
        <div className="cel-row-actions">
          <StatusPill status={run.status} />
          {!latest && (
            <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
              {open ? "Hide" : "Show"}
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="cel-stack" style={{ marginTop: 18 }}>
          {run.error && (
            <p style={{ color: "var(--bad-text)", background: "var(--bad-bg)", padding: "10px 14px", borderRadius: 12, margin: 0 }}>
              {run.error}
            </p>
          )}

          <div>
            <Label>Agent trace</Label>
            <Trace run={run} familiesById={familiesById} />
            {refused > 0 && (
              <p style={{ font: "var(--text-fine)", color: "var(--text-faint)", margin: "8px 0 0" }}>
                {refused} action{refused === 1 ? " was" : "s were"} refused by the policy engine. The agent proposes; code decides.
              </p>
            )}
          </div>

          {run.areas?.length > 0 && (
            <div>
              <Label>Areas under a wind signal, as read by the agent</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {[...run.areas]
                  .sort((a, b) => b.signal_level - a.signal_level)
                  .map((a, i) => (
                    <span
                      key={i}
                      style={{
                        font: "var(--text-fine)",
                        padding: "4px 10px",
                        borderRadius: "var(--radius-chip)",
                        background: a.signal_level >= config.policy.minSignal ? "var(--ok-bg)" : "var(--neutral-bg)",
                        color: a.signal_level >= config.policy.minSignal ? "var(--ok-text)" : "var(--neutral-text)",
                      }}
                    >
                      Signal {a.signal_level} · {a.municipality ? `${a.municipality}, ` : ""}
                      {a.province}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {run.drafts.length > 0 && (
            <div>
              <Label>Drafted payouts</Label>
              <Table
                rowKey={(r) => r.family_id}
                columns={[
                  {
                    key: "family",
                    label: "Family",
                    render: (d) => {
                      const f = familiesById[d.family_id];
                      return (
                        <span>
                          <strong>{f?.name || d.family_id}</strong>
                          <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-faint)" }}>
                            {f ? `${f.municipality}, ${f.province} · ${f.household_size} people` : ""}
                            {f && flagList(f.vulnerability).length ? ` · ${flagList(f.vulnerability).join(", ")}` : ""}
                          </span>
                        </span>
                      );
                    },
                  },
                  { key: "signal", label: "Signal", render: (d) => d.signal },
                  {
                    key: "amount",
                    label: "Amount / cap",
                    num: true,
                    render: (d) => (
                      <span style={{ whiteSpace: "nowrap" }}>
                        {money(d.amount, currency)}
                        <span style={{ color: "var(--text-faint)", fontWeight: 500 }}> / {money(d.max_amount, currency)}</span>
                      </span>
                    ),
                  },
                  { key: "rationale", label: "Agent's reason", render: (d) => <span style={{ font: "var(--text-meta)" }}>{d.rationale}</span> },
                ]}
                rows={run.drafts}
              />
              <p style={{ font: "var(--text-meta)", margin: "10px 0 0" }}>
                <strong>
                  {run.totals.recipients} families · {money(run.totals.amount, currency)}
                </strong>
                <span style={{ color: "var(--text-faint)" }}>
                  {" "}
                  of the {money(config.policy.maxPerRun, currency)} per-run cap
                </span>
              </p>
            </div>
          )}

          {run.summary && (
            <div>
              <Label>Agent summary</Label>
              <p style={{ font: "var(--text-meta)", color: "var(--text-dim)", whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{run.summary}</p>
            </div>
          )}

          {run.status === "awaiting_approval" && (
            <div
              className="cel-row-actions"
              style={{ borderTop: "1px solid var(--container-highest)", paddingTop: 16, justifyContent: "space-between" }}
            >
              <span style={{ font: "var(--text-meta)", color: config.paypalConfigured ? "var(--text-dim)" : "var(--warn-text)" }}>
                {config.paypalConfigured
                  ? "Nothing is sent until you approve. Policy is checked again at approval."
                  : "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server to send payouts."}
              </span>
              <div className="cel-row-actions">
                <Button variant="default" onClick={reject} disabled={busy}>
                  Reject
                </Button>
                <Button variant="primary" onClick={approve} disabled={busy || !config.paypalConfigured}>
                  Approve & send {money(run.totals.amount, currency)}
                </Button>
              </div>
            </div>
          )}
          {run.status === "approved" && (
            <p style={{ font: "var(--text-meta)", margin: 0 }}>
              Approved by {run.approved_by} {when(run.approved_at)}.{" "}
              <button onClick={() => go("payouts")} style={{ color: "var(--primary)", background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, cursor: "pointer" }}>
                Track the payouts
              </button>
            </p>
          )}
          {run.status === "rejected" && (
            <p style={{ font: "var(--text-meta)", color: "var(--text-dim)", margin: 0 }}>
              Rejected by {run.rejected_by}
              {run.rejected_reason ? `: ${run.rejected_reason}` : "."}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function PasteBulletin({ act, onAdded, onCancel }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  return (
    <Card title="Paste a bulletin">
      <form
        className="cel-stack"
        onSubmit={(e) => {
          e.preventDefault();
          act("Bulletin added.", () => api.addBulletin(title, text)).then(onAdded, () => {});
        }}
      >
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Typhoon Dalisay, Bulletin #9" />
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="cel-section-label" style={{ color: "var(--text-dim)" }}>
            Bulletin text
          </span>
          <textarea className="cel-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full tropical cyclone bulletin…" />
        </label>
        <div className="cel-row-actions">
          <Button type="submit" variant="outline" disabled={text.trim().length < 40}>
            Add bulletin
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function RespondPage({ data, config, act, busy, go }) {
  const [selectedId, setSelectedId] = useState(() => {
    const waiting = data.runs.find((r) => r.status === "awaiting_approval" || r.status === "running");
    return waiting?.bulletin_id || data.bulletins[0]?.id;
  });
  const [pasting, setPasting] = useState(false);
  const [showText, setShowText] = useState(false);

  const bulletin = data.bulletins.find((b) => b.id === selectedId);
  const runs = data.runs.filter((r) => r.bulletin_id === selectedId);
  const anyRunning = data.runs.some((r) => r.status === "running");
  const lastRunStatus = (id) => data.runs.find((r) => r.bulletin_id === id)?.status;

  return (
    <main className="cel-page cel-page--wide">
      <PageHeader
        title="Respond to a bulletin"
        lede="Pick a bulletin and run the AI agent. It drafts payouts for families in signal areas; you approve before anything is sent."
      />
      <div className="cel-split">
        <div className="cel-stack" style={{ gap: 10 }}>
          <Label>Bulletins</Label>
          {[...data.bulletins.filter((b) => b.kind === "custom").reverse(), ...data.bulletins.filter((b) => b.kind !== "custom")].map((b) => (
            <button
              key={b.id}
              className={`cel-bulletin-pick cel-press${b.id === selectedId ? " is-active" : ""}`}
              onClick={() => {
                setSelectedId(b.id);
                setPasting(false);
                setShowText(false);
              }}
            >
              <strong style={{ font: "var(--text-meta)", fontWeight: 700 }}>{b.title}</strong>
              <span style={{ font: "var(--text-fine)", color: "var(--text-faint)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {b.source} · {when(b.received_at)}
                {b.kind === "adversarial" && <Badge style={{ padding: "1px 8px" }}>Guardrail test</Badge>}
                {lastRunStatus(b.id) && <StatusPill status={lastRunStatus(b.id)} />}
              </span>
            </button>
          ))}
          <Button variant="ghost" onClick={() => setPasting(true)} style={{ alignSelf: "flex-start" }}>
            + Paste a new bulletin
          </Button>
        </div>

        <div className="cel-stack">
          {pasting ? (
            <PasteBulletin
              act={act}
              onCancel={() => setPasting(false)}
              onAdded={(b) => {
                setPasting(false);
                setSelectedId(b.id);
              }}
            />
          ) : bulletin ? (
            <>
              <Card>
                <div className="cel-row-actions" style={{ justifyContent: "space-between" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ font: "var(--text-h2)" }}>{bulletin.title}</strong>
                    <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-faint)" }}>
                      {bulletin.source} · received {when(bulletin.received_at)} {clock(bulletin.received_at)}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || anyRunning || !config.aiConfigured}
                    onClick={() => act("Agent started.", () => api.startRun(bulletin.id)).catch(() => {})}
                  >
                    {anyRunning ? "Agent is working…" : runs.length ? "Run the agent again" : "Run the agent"}
                  </Button>
                </div>
                {bulletin.kind === "adversarial" && (
                  <p style={{ font: "var(--text-meta)", color: "var(--warn-text)", margin: "12px 0 0" }}>
                    This bulletin has an injected instruction telling the agent to ignore limits and pay an outside address. Run it to
                    watch the guardrails hold.
                  </p>
                )}
                {!config.aiConfigured && (
                  <p style={{ font: "var(--text-meta)", color: "var(--warn-text)", margin: "12px 0 0" }}>
                    Set {config.aiProvider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} on the server to run the agent.
                  </p>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowText((s) => !s)} style={{ marginTop: 10, paddingLeft: 0 }}>
                  {showText ? "Hide bulletin text" : "Show bulletin text"}
                </Button>
                {showText && <pre className="cel-pre">{bulletin.text}</pre>}
              </Card>
              {runs.map((r, i) => (
                <RunCard key={r.id} run={r} data={data} config={config} act={act} busy={busy} go={go} latest={i === 0} />
              ))}
              {runs.length === 0 && (
                <p style={{ color: "var(--text-faint)", font: "var(--text-meta)" }}>
                  The agent has not looked at this bulletin yet.
                </p>
              )}
            </>
          ) : (
            <p style={{ color: "var(--text-faint)" }}>No bulletins yet. Paste one to start.</p>
          )}
        </div>
      </div>
    </main>
  );
}
