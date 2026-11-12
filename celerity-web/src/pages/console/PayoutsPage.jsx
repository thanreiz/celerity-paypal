import React, { useMemo } from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import Table from "../../design/Table";
import StatusPill from "../../design/StatusPill";
import { api } from "../../lib/api";
import { money, when, clock, stormName } from "../../lib/format";
import { PageHeader, copyText } from "./parts";

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

// Total per funding pool across a batch's items, largest first.
function splitOf(batch) {
  const t = {};
  for (const i of batch.items) for (const f of i.funding || []) t[f.pool_id] = (t[f.pool_id] || 0) + Math.round(f.amount * 100);
  return Object.entries(t)
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => [id, c / 100]);
}

/** The SMS this family got when the payout was sent (simulated sending),
 * with its private link. */
function FarmerMessage({ sms, notify }) {
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: "pointer", font: "var(--text-fine)", fontWeight: 700, color: "var(--primary)" }}>Message to farmer</summary>
      <div style={{ marginTop: 6, padding: "10px 12px", borderRadius: 10, background: "var(--surface-low)", font: "var(--text-fine)" }}>
        <p lang="tl" style={{ margin: 0 }}>{sms.tl}</p>
        <p style={{ margin: "6px 0 0", color: "var(--text-faint)" }}>{sms.en}</p>
        <span style={{ display: "block", margin: "6px 0 0", color: "var(--text-faint)" }}>SMS sending is simulated in this demo.</span>
        <div className="cel-row-actions" style={{ marginTop: 8 }}>
          <Button size="sm" variant="ghost" onClick={async () => notify((await copyText(sms.link)) ? "Farmer link copied." : "Couldn't copy; open it instead.", false)}>
            Copy link
          </Button>
          <a href={sms.link} target="_blank" rel="noopener" style={{ font: "var(--text-fine)", fontWeight: 700, color: "var(--primary)", alignSelf: "center" }}>
            Open as farmer ↗
          </a>
        </div>
      </div>
    </details>
  );
}

export default function PayoutsPage({ data, config, act, busy, go, notify }) {
  const familiesById = useMemo(() => Object.fromEntries(data.families.map((f) => [f.id, f])), [data.families]);

  return (
    <main className="cel-page cel-page--wide">
      <PageHeader
        title="Payouts"
        lede={
          config.webhooksVerified
            ? "Each released run is one PayPal Payouts batch. Verified webhooks update status as PayPal reports it."
            : "Each released run is one PayPal Payouts batch. Webhooks are not configured, so use “Refresh from PayPal” on a batch to get its latest status."
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
                  {b.approved_by === "rules" ? "Released by the rules" : `Approved by ${b.approved_by}`} {when(b.created_at)} · {delivered.length}/{b.items.length} delivered ·{" "}
                  {money(delivered.reduce((s, i) => s + i.amount, 0), b.items[0]?.currency)} of {money(total, b.items[0]?.currency)}
                </span>
                <span className="cel-mono" style={{ color: "var(--text-faint)" }}>
                  {b.payout_batch_id ? `PayPal batch ${b.payout_batch_id}` : "Sending to PayPal…"}
                </span>
                {splitOf(b).length > 0 && (
                  <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-dim)", marginTop: 2 }}>
                    Funded by{" "}
                    {splitOf(b)
                      .map(([id, amount]) => `${data.pools.find((p) => p.id === id)?.name || id} ${money(amount, b.items[0]?.currency)}`)
                      .join(" · ")}
                  </span>
                )}
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
                        {i.sms && <FarmerMessage sms={i.sms} notify={notify} />}
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
