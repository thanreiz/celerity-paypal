import React, { useState } from "react";
import Button from "../../design/Button";
import { short } from "../../lib/config";
import { farmerInitials } from "../../lib/farmers";
import { regionShort } from "../../lib/regions";

/**
 * "Is this you?" — one-tap confirm for farmers.
 * Person first: big name + place, everyday words, clear Yes / Not me.
 * Demo multi-farmer switch stays visible but reads as "who is opening".
 */
export default function ConnectScreen({
  me,
  farmerName = "Mang Ramon",
  region = 5,
  farmers,
  activeRole,
  onSwitchFarmer,
  onConnected,
  onNotMe,
}) {
  const [showId, setShowId] = useState(false);
  const initials = farmerInitials(farmerName);
  const place = regionShort(region);

  return (
    <div className="cel-connect">
      <div className="cel-connect-sky" aria-hidden="true" />
      <div className="cel-connect-field" aria-hidden="true" />

      <header className="cel-connect-brand cel-fade">
        <img className="cel-connect-logo" src="/logo-lockup.png" alt="Celerity" />
        <p className="cel-connect-tag">Relief that moves</p>
      </header>

      <div className="cel-connect-body">
        <h1 className="cel-connect-h cel-fade cel-fade-1">Is this you?</h1>
        <p className="cel-connect-sub cel-fade cel-fade-2">
          Check the name and place. Then tap Yes to open your relief money.
        </p>

        {farmers?.length > 1 && onSwitchFarmer && (
          <div className="cel-connect-who cel-fade cel-fade-2" role="group" aria-label="Choose farmer">
            <span className="cel-connect-who-lbl">Who is opening?</span>
            <div className="cel-connect-who-row">
              {farmers.map((f) => {
                const on = f.role === activeRole;
                return (
                  <button
                    key={f.role}
                    type="button"
                    onClick={() => onSwitchFarmer(f.role)}
                    className={"cel-press cel-connect-who-btn" + (on ? " is-on" : "")}
                    aria-pressed={on}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="cel-connect-person cel-fade cel-fade-3">
          <div className="cel-id-avatar cel-id-avatar--lg" key={farmerName}>
            {initials}
            <span className="cel-id-check" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M6 12.5 10 16.5 18 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>

          <p className="cel-id-name cel-id-name--lg">{farmerName}</p>
          <p className="cel-id-region cel-id-region--icon">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1.5c2.5 0 4.5 2 4.5 4.4C11.5 9 7 12.5 7 12.5S2.5 9 2.5 5.9C2.5 3.5 4.5 1.5 7 1.5Z" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="7" cy="5.9" r="1.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            {place}
          </p>

          <p className="cel-connect-enrolled">On your town&apos;s farmer list</p>

          <p className="cel-id-reassure">
            Your relief money stays here safely. Only you can open it.
          </p>

          <button
            type="button"
            className={"cel-id-wallet" + (showId ? " is-open" : "")}
            onClick={() => setShowId((s) => !s)}
            aria-expanded={showId}
          >
            <span className="cel-id-wallet-lbl">{showId ? "Account number" : "Show account number"}</span>
            {showId && <span className="cel-id-wallet-val">{me ? short(me) : "—"}</span>}
            <svg className="cel-id-wallet-chev" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="cel-connect-actions cel-fade cel-fade-4">
        <Button variant="primary" onClick={onConnected} style={{ width: "100%", fontSize: 17, minHeight: 54 }}>
          Yes, this is me
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ marginLeft: 4 }} aria-hidden="true">
            <path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>

        {onNotMe && (
          <button type="button" className="cel-id-notme" onClick={onNotMe}>
            This isn&apos;t me
          </button>
        )}

        <span className="cel-trust cel-connect-foot">
          <svg width="13" height="14" viewBox="0 0 13 14" fill="none" aria-hidden="true">
            <path d="M6.5 1 11.5 3.1V6.7C11.5 9.9 9.4 12.3 6.5 13 3.6 12.3 1.5 9.9 1.5 6.7V3.1L6.5 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.5 6.9 6 8.4 8.7 5.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Money protected · Stellar
        </span>
      </div>
    </div>
  );
}
