import React from "react";
import { UNIT } from "../../lib/config";
import { phpValue } from "../../lib/anchor";
import { funderLabel } from "../../lib/celerity";

export default function ActivityScreen({ receipts, pools }) {
  const regionOf = (poolId) => pools.find((p) => String(p.id) === String(poolId))?.region;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 18px 18px" }}>
      {receipts.length === 0 && (
        <p style={{ font: "var(--text-body)", color: "var(--text-faint)", padding: "8px 4px" }}>
          Nothing yet — payments appear seconds after a signed typhoon signal.
        </p>
      )}
      {receipts.map((r, i) => {
        const amount = Number(BigInt(r.amount)) / Number(UNIT);
        const region = regionOf(r.pool_id);
        return (
          <div key={i} style={txCardStyle}>
            <div style={txIconStyle}>↓</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>Received from {funderLabel(r.funder)}</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 1 }}>
                {region != null ? `Region ${region} · ` : ""}Pool #{String(r.pool_id)}
              </div>
            </div>
            <div style={{ font: "var(--text-money)", color: "var(--ok-text)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              +{phpValue(amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const txCardStyle = {
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  padding: "14px 16px",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const txIconStyle = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: "var(--ok-bg)",
  color: "var(--ok-text)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 17,
  flexShrink: 0,
};
