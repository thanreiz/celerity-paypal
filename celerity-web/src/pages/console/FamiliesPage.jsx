import React, { useState } from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import Input from "../../design/Input";
import Table from "../../design/Table";
import StatusPill from "../../design/StatusPill";
import { api } from "../../lib/api";
import { FLAG_LABELS, flagList, when } from "../../lib/format";
import { PageHeader } from "./parts";

const EMPTY = { name: "", municipality: "", province: "", household_size: "4", paypal_email: "", vulnerability: {} };

function AddFamily({ act, onDone }) {
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Card title="Register a family">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act("Family registered.", () => api.addFamily({ ...f, household_size: Number(f.household_size) })).then(() => {
            setF(EMPTY);
            onDone();
          }, () => {});
        }}
        style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        <Input label="Head of household" value={f.name} onChange={set("name")} required />
        <Input label="Municipality / city" value={f.municipality} onChange={set("municipality")} required />
        <Input label="Province" value={f.province} onChange={set("province")} required />
        <Input label="Household size" type="number" min="1" max="30" value={f.household_size} onChange={set("household_size")} required />
        <Input label="PayPal email" type="email" value={f.paypal_email} onChange={set("paypal_email")} required />
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

export default function FamiliesPage({ data, act, busy }) {
  const [adding, setAdding] = useState(false);
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
      {adding && <AddFamily act={act} onDone={() => setAdding(false)} />}
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
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title={`Registered ${when(f.registered_at)}`}
                  onClick={() =>
                    act(
                      f.status === "active" ? `${f.name} suspended.` : `${f.name} reactivated.`,
                      () => api.setFamilyStatus(f.id, f.status === "active" ? "suspended" : "active")
                    ).catch(() => {})
                  }
                >
                  {f.status === "active" ? "Suspend" : "Reactivate"}
                </Button>
              ),
            },
          ]}
          rows={rows}
        />
      </Card>
    </main>
  );
}
