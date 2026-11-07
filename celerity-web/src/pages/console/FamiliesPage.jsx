import React, { useMemo, useState } from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import Input from "../../design/Input";
import Table from "../../design/Table";
import StatusPill from "../../design/StatusPill";
import Badge from "../../design/Badge";
import { api } from "../../lib/api";
import { FLAG_LABELS, flagList, when } from "../../lib/format";
import { PageHeader, copyText } from "./parts";

const EMPTY = { name: "", municipality: "", province: "", household_size: "4", paypal_email: "", vulnerability: {} };

function AddFamily({ act, notify, onDone }) {
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Card title="Register a family">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act("Family registered.", () => api.addFamily({ ...f, household_size: Number(f.household_size) })).then((family) => {
            if (family?.warning) notify(`Registered, but ${family.warning}.`, true);
            setF(EMPTY);
            onDone();
          }, () => {});
        }}
        style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        <Input label="Head of household" value={f.name} onChange={set("name")} required maxLength={100} />
        <Input label="Municipality / city" value={f.municipality} onChange={set("municipality")} required maxLength={60} />
        <Input label="Province" value={f.province} onChange={set("province")} required maxLength={60} />
        <Input label="Household size" type="number" min="1" max="30" value={f.household_size} onChange={set("household_size")} required />
        <Input label="PayPal email" type="email" value={f.paypal_email} onChange={set("paypal_email")} required maxLength={254} />
        <fieldset style={{ border: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center" }}>
          <legend className="cel-section-label" style={{ color: "var(--text-dim)", marginBottom: 6 }}>
            Vulnerability
          </legend>
          {Object.entries(FLAG_LABELS).map(([k, label]) => (
            <label key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center", font: "var(--text-meta)" }}>
              <input
                type="checkbox"
                checked={Boolean(f.vulnerability[k])}
                onChange={(e) => setF((s) => ({ ...s, vulnerability: { ...s.vulnerability, [k]: e.target.checked } }))}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="cel-row-actions" style={{ gridColumn: "1 / -1" }}>
          <Button type="submit" variant="outline">
            Register family
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function FamiliesPage({ data, act, busy, notify }) {
  const [adding, setAdding] = useState(false);
  // Families paid into one PayPal account. Allowed (a household may share
  // one), but each family is paid separately, so coordinators should see it.
  const emailCount = useMemo(() => {
    const n = {};
    for (const f of data.families) {
      if (!f.demo_receiver) n[f.paypal_email.toLowerCase()] = (n[f.paypal_email.toLowerCase()] || 0) + 1;
    }
    return n;
  }, [data.families]);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = data.families.filter(
    (f) => !q || [f.name, f.municipality, f.province].some((v) => v.toLowerCase().includes(q))
  );

  return (
    <main className="cel-page cel-page--wide">
      <PageHeader
        title="Families"
        lede="The registry is maintained by people, not the agent. The agent can only pay families listed here, to the PayPal email on file."
      >
        {!adding && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            + Register a family
          </Button>
        )}
      </PageHeader>
      {adding && <AddFamily act={act} notify={notify} onDone={() => setAdding(false)} />}
      {data.cases?.some((c) => c.status === "open") && (
        <Card title="Cases from the Farmer app">
          <p style={{ margin: "0 0 10px", font: "var(--text-meta)", color: "var(--text-dim)" }}>
            Opened by the helper agent when a farmer needs a person. The agent can't change payouts; you follow up.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {data.cases
              .filter((c) => c.status === "open")
              .map((c) => {
                const f = data.families.find((x) => x.id === c.family_id);
                return (
                  <li key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span>
                      <strong>{f ? `${f.name}, ${f.municipality}` : c.family_id}</strong> · {c.topic.replace(/_/g, " ")}
                      <span style={{ display: "block", font: "var(--text-meta)", color: "var(--text-dim)" }}>{c.summary}</span>
                    </span>
                    <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>{new Date(c.at).toLocaleString()}</span>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}
      <Card>
        <div style={{ maxWidth: 320, marginBottom: 12 }}>
          <Input placeholder="Search name, town, or province" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search families" />
        </div>
        <Table
          rowKey={(r) => r.id}
          emptyText="No families match."
          columns={[
            {
              key: "name",
              label: "Head of household",
              render: (f) => (
                <span>
                  <strong>{f.name}</strong>
                  {!f.demo_receiver && emailCount[f.paypal_email.toLowerCase()] > 1 && (
                    <Badge style={{ padding: "1px 8px", marginLeft: 6 }} title={`${emailCount[f.paypal_email.toLowerCase()]} families use this PayPal email`}>
                      Shared PayPal
                    </Badge>
                  )}
                  <span className="cel-mono" style={{ display: "block", color: "var(--text-faint)" }}>
                    {f.id}
                  </span>
                </span>
              ),
            },
            { key: "where", label: "Location", render: (f) => `${f.municipality}, ${f.province}` },
            { key: "household_size", label: "People", num: true },
            { key: "flags", label: "Vulnerability", render: (f) => flagList(f.vulnerability).join(", ") || "—" },
            { key: "status", label: "Status", render: (f) => <StatusPill status={f.status} /> },
            {
              key: "actions",
              label: "",
              render: (f) => (
                <span className="cel-row-actions" style={{ flexWrap: "nowrap" }}>
                {f.link_token && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Copy ${f.name}'s private farmer link`}
                    onClick={async () => {
                      const link = `${window.location.origin}/#/r/${f.link_token}`;
                      notify((await copyText(link)) ? `${f.name}'s farmer link copied.` : link, false);
                    }}
                  >
                    Farmer link
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title={`Registered ${when(f.registered_at)}`}
                  aria-label={`${f.status === "active" ? "Suspend" : "Reactivate"} ${f.name}`}
                  onClick={() =>
                    act(
                      f.status === "active" ? `${f.name} suspended.` : `${f.name} reactivated.`,
                      () => api.setFamilyStatus(f.id, f.status === "active" ? "suspended" : "active")
                    ).catch(() => {})
                  }
                >
                  {f.status === "active" ? "Suspend" : "Reactivate"}
                </Button>
                </span>
              ),
            },
          ]}
          rows={rows}
        />
      </Card>
    </main>
  );
}
