import React from "react";
import { short } from "../../lib/config";

export default function ProfileScreen({ me, registration, farmerName }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 18px 18px" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "linear-gradient(160deg, var(--primary-hover), var(--primary))",
            color: "var(--on-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "var(--text-h2)",
          }}
        >
          {farmerName.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{farmerName}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
          {registration ? `Region ${registration.region}` : "Not yet registered"}
        </div>
        {registration && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "var(--ok-bg)",
              color: "var(--ok-text)",
              borderRadius: "var(--radius-chip)",
              padding: "4px 12px",
              font: "var(--text-fine)",
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            Verified beneficiary
          </span>
        )}
      </div>

      <div>
        <p style={{ margin: "0 0 8px 2px", font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>Registration</p>
        <div style={infoCardStyle}>
          {registration ? (
            <>
              <InfoRow k="Enrolled by" v={short(registration.registered_by)} />
              <InfoRow k="Region" v={registration.region} />
            </>
          ) : (
            <div style={{ padding: 16, font: "var(--text-fine)", color: "var(--text-faint)" }}>
              Not registered yet — an LGU/co-op admin must enroll you before you can receive releases.
            </div>
          )}
        </div>
      </div>

      <div>
        <p style={{ margin: "0 0 8px 2px", font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>Support</p>
        <div style={infoCardStyle}>
          <InfoRow k="Help center" v="Contact your co-op" faint />
          <InfoRow k="About Celerity" v="How relief funds reach you" faint />
        </div>
      </div>

      <p
        style={{
          margin: "8px 0 0",
          textAlign: "center",
          font: "var(--text-label)",
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "var(--tracking-label)",
        }}
      >
        Enforced on-chain · no company holds your keys
      </p>
    </div>
  );
}

function InfoRow({ k, v, faint }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--container-highest)", font: "var(--text-table)", fontSize: 13.5 }}>
      <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{k}</span>
      <span style={{ color: faint ? "var(--text-faint)" : "var(--text)", fontWeight: faint ? 500 : 700, textAlign: "right" }}>{v}</span>
    </div>
  );
}

const infoCardStyle = {
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};
