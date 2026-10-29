import React, { useState } from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import Input from "../../design/Input";
import Badge from "../../design/Badge";
import StatusPill from "../../design/StatusPill";
import { api } from "../../lib/api";
import { money, when, stormName } from "../../lib/format";

const earmark = (p) => `${p.provinces?.length ? p.provinces.join(", ") : "Nationwide"} · ${p.hazard || "typhoon"}`;

/** In-page form (no native dialog): who is giving and how much, then off to
 * PayPal Checkout. The pool is credited only when PayPal confirms. */
function FundForm({ pool, currency, onCancel }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="cel-pop cel-stack"
      style={{ gap: 12, marginTop: 14, padding: 16, borderRadius: 12, background: "var(--surface-low)" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const { approveUrl } = await api.fundPool(pool.id, name.trim(), Number(amount));
          window.location.assign(approveUrl);
        } catch (err) {
          setError(err.message);
          setBusy(false);
        }
      }}
    >
      <strong>Fund {pool.name}</strong>
      <Input label="Your organization" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="e.g. Bayanihan Relief Fund" />
      <Input
        label={`Amount (${currency})`}
        type="number"
        inputMode="decimal"
        min="100"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        error={error}
        hint="From 100. It is earmarked for this pool and paid out only to registered families in its area."
      />
      <div className="cel-row-actions">
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || !amount}>
          {busy ? "Opening PayPal…" : `Continue to PayPal${amount ? ` · ${money(amount, currency)}` : ""}`}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Stat({ label, value, tone }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <span className="cel-section-label">{label}</span>
      <strong style={{ font: "var(--text-h2)", color: tone || "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</strong>
    </span>
  );
}

/** One card per pool: funder, earmark, money in / committed / left, where it
 * went, and who put it in. `canFund` adds the PayPal Checkout button. */
export function PoolList({ pools, currency, canFund = true }) {
  const [funding, setFunding] = useState(null);
  const [open, setOpen] = useState(null);
  if (!pools?.length) return <p style={{ color: "var(--text-faint)" }}>No funding pools yet.</p>;
  return (
    <div className="cel-stack">
      {pools.map((p) => {
        const usedPct = p.contributed > 0 ? Math.min(100, Math.round((p.committed / p.contributed) * 100)) : 0;
        const demo = p.contributions.some((c) => c.source === "seed");
        return (
          <Card key={p.id}>
            <div className="cel-row-actions" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ font: "var(--text-h2)" }}>{p.name}</strong>
                <span style={{ display: "block", font: "var(--text-meta)", color: "var(--text-dim)" }}>{p.funder}</span>
                <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-faint)" }}>Earmarked: {earmark(p)}</span>
              </div>
              {canFund && funding !== p.id && (
                <Button variant="outline" onClick={() => setFunding(p.id)} aria-label={`Fund ${p.name}`}>
                  Fund this pool
                </Button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 16 }}>
              <Stat label="Put in" value={money(p.contributed, currency)} />
              <Stat label="Paid out" value={money(p.committed, currency)} />
              <Stat label="Left" value={money(p.available, currency)} tone={p.available > 0 ? "var(--ok-text)" : "var(--bad-text)"} />
            </div>
            <div
              role="img"
              aria-label={`${usedPct}% of this pool is committed to payouts`}
              style={{ height: 8, borderRadius: 999, background: "var(--container)", marginTop: 12, overflow: "hidden" }}
            >
              <div style={{ width: `${usedPct}%`, height: "100%", background: "var(--primary)", transition: "width var(--transition-base)" }} />
            </div>

            {funding === p.id && <FundForm pool={p} currency={currency} onCancel={() => setFunding(null)} />}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(open === p.id ? null : p.id)}
              aria-expanded={open === p.id}
              style={{ marginTop: 10, paddingLeft: 0 }}
            >
              {open === p.id ? "Hide where the money went" : `Where the money went (${p.payouts.length})`}
            </Button>

            {open === p.id && (
              <div className="cel-stack" style={{ gap: 14, marginTop: 6 }}>
                {p.payouts.length === 0 && <p style={{ color: "var(--text-faint)", margin: 0 }}>Nothing paid from this pool yet.</p>}
                {p.payouts.map((x) => (
                  <div key={x.batch_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ minWidth: 0 }}>
                      <strong>
                        {money(x.amount, currency)} → {x.families} famil{x.families === 1 ? "y" : "ies"}
                      </strong>
                      <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-dim)" }}>
                        {stormName(x.storm)} · {x.places.join("; ")}
                      </span>
                      <span className="cel-mono" style={{ display: "block", color: "var(--text-faint)" }}>
                        {x.payout_batch_id ? `PayPal batch ${x.payout_batch_id}` : "Sending to PayPal"} · {when(x.created_at)}
                      </span>
                    </span>
                    <StatusPill status={x.status} />
                  </div>
                ))}
                <div>
                  <span className="cel-section-label">Who put money in</span>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, font: "var(--text-meta)" }}>
                    {p.contributions.map((c, i) => (
                      <li key={i}>
                        {c.funder_name} · {money(c.amount, currency)} · {when(c.at)}{" "}
                        {c.source === "seed" ? (
                          <Badge style={{ padding: "1px 8px" }}>demo pledge</Badge>
                        ) : (
                          <Badge style={{ padding: "1px 8px", background: "var(--ok-bg)", color: "var(--ok-text)", borderColor: "var(--ok-line)" }}>
                            via PayPal
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {demo && open !== p.id && (
              <p style={{ font: "var(--text-fine)", color: "var(--text-faint)", margin: "6px 0 0" }}>Includes a demo pledge seeded for this sandbox.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
