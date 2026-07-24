import React, { useState } from "react";
import Table from "../../design/Table";
import StatusPill from "../../design/StatusPill";
import Avatar from "../../design/Avatar";
import Button from "../../design/Button";
import Input from "../../design/Input";
import Select from "../../design/Select";
import Switch from "../../design/Switch";
import { registerFarmer, removeFarmer } from "../../lib/celerity";
import { short } from "../../lib/config";
import { farmerLabel, farmerInitials } from "../../lib/farmers";
import { regionName, REGION_OPTIONS } from "../../lib/regions";

function initialsFor(addr) {
  const label = farmerLabel(addr);
  if (label && !label.includes("…")) return farmerInitials(label);
  return addr.slice(0, 2).toUpperCase();
}

/** The registry is the LGU/government's list, not the funders'. Funders get a
 * read-only view; enrollment/removal live behind an explicit registrar mode
 * that signs with the contract's admin key (played by you in this demo). */
export default function FarmersPage({ groups, busy, run }) {
  const [registrarMode, setRegistrarMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addr, setAddr] = useState("");
  const [region, setRegion] = useState(5);

  const register = () =>
    run("Register farmer", () => registerFarmer(addr.trim(), region)).then(() => {
      setShowAdd(false);
      setAddr("");
    });

  const columns = [
    {
      key: "addr",
      label: "Farmer",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar initials={initialsFor(r.addr)} size={32} />
          <div>
            <div style={{ fontWeight: 700 }}>{farmerLabel(r.addr)}</div>
            <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>{short(r.addr)}</div>
          </div>
        </div>
      ),
    },
    { key: "registered_by", label: "Enrolled By (LGU)", render: (r) => short(r.registered_by) },
    { key: "status", label: "Status", render: () => <StatusPill status="Registered" /> },
    ...(registrarMode
      ? [
          {
            key: "actions",
            label: "",
            render: (r) => (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("Remove farmer", () => removeFarmer(r.addr))}>
                Remove
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "8px 32px 48px", maxWidth: 1120, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--container-highest)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 380px" }}>
          <p style={{ margin: 0, font: "var(--text-body-lg)", fontWeight: 700, color: "var(--text)" }}>
            This list belongs to the government, not to funders.
          </p>
          <p style={{ margin: "4px 0 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>
            The LGU / Department of Agriculture enrolls beneficiaries with the registry admin key — the
            contract only ever pays addresses on this list, and funders can look but not touch.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ font: "var(--text-fine)", fontWeight: 700, color: registrarMode ? "var(--warn-text)" : "var(--text-faint)" }}>
            LGU registrar mode{registrarMode ? " — signing with the admin key (demo)" : ""}
          </span>
          <Switch checked={registrarMode} onChange={(e) => { setRegistrarMode(e.target.checked); setShowAdd(false); }} />
        </div>
      </div>

      {registrarMode && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Button variant="primary" onClick={() => setShowAdd((s) => !s)}>+ Enroll Farmer</Button>
        </div>
      )}

      {registrarMode && showAdd && (
        <div style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 20, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 320px" }}>
            <Input label="Stellar address" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="G..." />
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <Select label="Region" value={region} onChange={(e) => setRegion(e.target.value)} options={REGION_OPTIONS} />
          </div>
          <Button variant="primary" disabled={busy || !addr.trim()} onClick={register}>Enroll</Button>
        </div>
      )}

      {groups.map((group, gi) => (
        <div
          key={group.region}
          className={`cel-fade cel-fade-${Math.min(gi + 1, 6)}`}
          style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", overflow: "hidden" }}
        >
          <div style={{ padding: "12px 24px", background: "var(--surface-low)", borderBottom: "1px solid var(--container-highest)", display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, font: "var(--text-label)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", color: "var(--text)" }}>
              {regionName(group.region)}
            </h3>
            <span style={{ padding: "1px 8px", borderRadius: 999, background: "var(--container-highest)", color: "var(--text-dim)", font: "var(--text-fine)", fontWeight: 700 }}>
              {group.list.length}
            </span>
          </div>
          <Table
            columns={columns}
            rows={group.list}
            rowKey={(r) => r.addr}
            emptyText="No farmers enrolled in this region yet."
          />
        </div>
      ))}
      {groups.length === 0 && (
        <p style={{ font: "var(--text-body)", color: "var(--text-faint)" }}>
          No pools yet, so no regions to enroll farmers in. Create a pool first.
        </p>
      )}
    </div>
  );
}
