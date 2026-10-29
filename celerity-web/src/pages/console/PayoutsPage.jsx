import React, { useMemo } from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import Table from "../../design/Table";
import StatusPill from "../../design/StatusPill";
import { api } from "../../lib/api";
import { money, when, clock, stormName } from "../../lib/format";
import { PageHeader } from "./parts";

const SOURCE_LABELS = { "paypal-webhook": "webhook", "paypal-poll": "PayPal lookup" };

function Timeline({ history }) {
  return (
    <span className="cel-timeline">
      {history.map((h, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden="true">→</span>}
          <span title={`${new Date(h.at).toLocaleString()} via ${SOURCE_LABELS[h.source] || h.source}`}>
            <strong style={{ color: h.status === "SUCCESS" ? "var(--ok-text)" : "var(--text-dim)" }}>
              {h.status === "APPROVED" ? "Approved" : h.status.charAt(0) + h.status.slice(1).toLowerCase()}
            </strong>{" "}
            {clock(h.at)}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

function maskEmail(email) {
  const [user, domain] = String(email).split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export default function PayoutsPage({ data, config, act, busy, go }) {
  const familiesById = useMemo(() => Object.fromEntries(data.families.map((f) => [f.id, f])), [data.families]);

  return (
    <main className="cel-page cel-page--wide">
      <PageHeader
        title="Payouts"
        lede={
          config.webhooksVerified
            ? "Each approved run is one PayPal Payouts batch. Verified webhooks update status as PayPal reports it."
            : "Each approved run is one PayPal Payouts batch. Webhooks are not configured, so use “Refresh from PayPal” on a batch to get its latest status."
        }
      />
      {data.batches.length === 0 && (
        <Card>
          <p style={{ color: "var(--text-faint)", margin: 0 }}>No payouts yet.</p>
          <Button variant="outline" onClick={() => go("respond")} style={{ marginTop: 12 }}>
            Respond to a bulletin
          </Button>
        </Card>
      )}
      {data.batches.map((b) => {
        const total = b.items.reduce((s, i) => s + i.amount, 0);
        const delivered = b.items.filter((i) => i.status === "SUCCESS");
        return (
          <Card key={b.id}>
            <div className="cel-row-actions" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ font: "var(--text-h2)" }}>{stormName(b.storm)}</strong>
                <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-faint)" }}>
                  Approved by {b.approved_by} {when(b.created_at)} · {delivered.length}/{b.items.length} delivered ·{" "}
                  {money(delivered.reduce((s, i) => s + i.amount, 0), b.items[0]?.currency)} of {money(total, b.items[0]?.currency)}
                </span>
                <span className="cel-mono" style={{ color: "var(--text-faint)" }}>
                  PayPal batch {b.payout_batch_id}
                </span>
              </div>
              <div className="cel-row-actions">
                <StatusPill status={b.status} />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => act("Status refreshed from PayPal.", () => api.refreshBatch(b.id)).catch(() => {})}
                >
                  Refresh from PayPal
                </Button>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Table
                rowKey={(r) => r.sender_item_id}
                columns={[
                  {
                    key: "family",
                    label: "Family",
                    render: (i) => (
                      <span>
                        <strong>{familiesById[i.family_id]?.name || i.family_id}</strong>
                        <span className="cel-mono" style={{ display: "block", color: "var(--text-faint)" }}>
                          {maskEmail(i.receiver)}
                        </span>
                      </span>
                    ),
                  },
                  { key: "amount", label: "Amount", num: true, render: (i) => money(i.amount, i.currency) },
                  { key: "status", label: "Status", render: (i) => <StatusPill status={i.status} /> },
                  {
                    key: "timeline",
                    label: "Timeline",
                    render: (i) => (
                      <span>
                        <Timeline history={i.history} />
                        {i.transaction_id && (
                          <span className="cel-mono" style={{ display: "block", color: "var(--text-faint)" }}>
                            tx {i.transaction_id}
                          </span>
                        )}
                        {i.error && <span style={{ display: "block", font: "var(--text-fine)", color: "var(--bad-text)" }}>{i.error}</span>}
                      </span>
                    ),
                  },
                ]}
                rows={b.items}
              />
            </div>
            {b.items.some((i) => i.status === "UNCLAIMED") && (
              <p style={{ font: "var(--text-fine)", color: "var(--text-faint)", margin: "10px 0 0" }}>
                Unclaimed means the email has no PayPal account yet. PayPal holds the money for 30 days and emails the family how to claim
                it, then returns it if unclaimed.
              </p>
            )}
          </Card>
        );
      })}
    </main>
  );
}
