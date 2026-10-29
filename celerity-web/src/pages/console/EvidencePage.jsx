import React, { useMemo } from "react";
import Card from "../../design/Card";
import Table from "../../design/Table";
import { eventLabel, eventDetail, short, when } from "../../lib/format";
import { PageHeader } from "./parts";

export function ChainStatus({ chain }) {
  return (
    <Card variant={chain.ok ? "default" : "notice"}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            display: "inline-grid",
            placeItems: "center",
            flexShrink: 0,
            background: chain.ok ? "var(--ok-bg)" : "var(--bad-bg)",
            color: chain.ok ? "var(--ok-text)" : "var(--bad-text)",
            fontWeight: 800,
          }}
        >
          {chain.ok ? "✓" : "!"}
        </span>
        <div style={{ minWidth: 0 }}>
          <strong>{chain.ok ? `Chain verified: ${chain.length} entries, none altered` : `Chain broken at entry ${chain.brokenAt}`}</strong>
          <p style={{ font: "var(--text-meta)", color: "var(--text-dim)", margin: "2px 0 0" }}>
            Every entry includes the SHA-256 hash of the one before it, so editing or deleting any past entry breaks every hash after it.
          </p>
          {chain.ok && chain.head && (
            <span className="cel-mono" style={{ color: "var(--text-faint)" }}>
              head {chain.head}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function EvidencePage({ data }) {
  const names = useMemo(() => Object.fromEntries(data.families.map((f) => [f.id, f.name])), [data.families]);
  return (
    <main className="cel-page cel-page--wide">
      <PageHeader
        title="Evidence log"
        lede="Append-only record of who did what: every agent run, approval, PayPal batch, webhook, and registry change."
      />
      <ChainStatus chain={data.chain} />
      <Card>
        <Table
          rowKey={(r) => r.id}
          columns={[
            { key: "seq", label: "#", num: true },
            { key: "at", label: "When", render: (e) => <span style={{ whiteSpace: "nowrap" }}>{when(e.at)}</span> },
            {
              key: "type",
              label: "Event",
              render: (e) => (
                <span>
                  <strong>{eventLabel(e.type)}</strong>
                  <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-dim)", overflowWrap: "anywhere" }}>
                    {eventDetail(e, names)}
                  </span>
                </span>
              ),
            },
            { key: "actor", label: "Actor" },
            {
              key: "hash",
              label: "Hash",
              render: (e) => (
                <span className="cel-mono" title={`prev ${e.prevHash}\nthis ${e.hash}`} style={{ color: "var(--text-faint)" }}>
                  {short(e.hash)}
                </span>
              ),
            },
          ]}
          rows={data.events}
        />
      </Card>
    </main>
  );
}
