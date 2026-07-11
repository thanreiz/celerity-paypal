import React, { useRef, useState } from "react";
import Badge from "../../design/Badge";
import Button from "../../design/Button";
import Input from "../../design/Input";
import { reportAndSettle, reportAndSettleMany } from "../../lib/celerity";
import { regionName, islandOf, ISLANDS } from "../../lib/regions";

// ---------------------------------------------------------------------------
// DEMO ORACLE — this screen stands in for the PAGASA/JMA feed. The bulletin
// is a plain JSON file; the app reads it, shows exactly what will settle, and
// only then signs one Ed25519 event per region with the demo oracle key.
// The contract never reads the bulletin — it verifies signatures and numbers.
// ---------------------------------------------------------------------------

/** A believable sample bulletin, derived from the live pools so the demo
 * always has matching regions — plus a couple of quiet regions to show the
 * skip path honestly. */
function sampleBulletin(pools) {
  const signals = {};
  for (const p of pools) {
    const strong = Math.min(5, Math.max(4, Number(p.signal_threshold)));
    signals[p.region] = Math.max(signals[p.region] ?? 0, strong);
  }
  if (!(2 in signals)) signals[2] = 1;
  if (!(7 in signals)) signals[7] = 2;
  return {
    typhoon: "Rosing",
    issued: new Date().toISOString().slice(0, 16).replace("T", " "),
    authority: "PAGASA (demo bulletin)",
    signals,
  };
}

/** Validate + enrich a parsed bulletin against the live pool set. */
function analyze(bulletin, pools) {
  const rows = [];
  const warnings = [];
  for (const [key, rawSignal] of Object.entries(bulletin.signals ?? {})) {
    const region = Number(key);
    const signal = Number(rawSignal);
    if (!Number.isInteger(region) || region < 1) {
      warnings.push(`"${key}" is not a region number — skipped`);
      continue;
    }
    if (!Number.isInteger(signal) || signal < 1 || signal > 5) {
      warnings.push(`${regionName(region)}: signal "${rawSignal}" is not 1–5 — skipped`);
      continue;
    }
    const inRegion = pools.filter((p) => Number(p.region) === region);
    const matching = inRegion.filter((p) => p.status === "Active" && Number(p.signal_threshold) <= signal);
    const paused = inRegion.filter((p) => p.status === "Paused" && Number(p.signal_threshold) <= signal).length;
    rows.push({ region, signal, poolCount: inRegion.length, matching: matching.length, paused });
  }
  rows.sort((a, b) => a.region - b.region);
  const settle = rows.filter((r) => r.matching > 0);
  return { rows, warnings, settle };
}

const dropzoneStyle = {
  background: "var(--surface)",
  border: "2px dashed var(--outline)",
  borderRadius: 18,
  padding: "48px 28px 42px",
  textAlign: "center",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  boxShadow: "var(--shadow-card)",
  fontFamily: "var(--font-sans)",
};

export default function OraclePage({ pools, myPools, who, busy, run, refresh, onBulletin }) {
  const [state, setState] = useState({ kind: "empty" }); // empty | error | parsed | done
  const [progress, setProgress] = useState({}); // region -> {state, eventId?, released?, error?}
  const [manualRegion, setManualRegion] = useState(5);
  const [manualSignal, setManualSignal] = useState(4);
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const loadBulletin = (raw, sourceName) => {
    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      setState({ kind: "error", message: `${sourceName} is not valid JSON — ${e.message}` });
      return;
    }
    if (!parsed || typeof parsed.signals !== "object" || !parsed.typhoon) {
      setState({ kind: "error", message: `${sourceName} is missing "typhoon" or "signals" — see the sample for the expected shape.` });
      return;
    }
    setProgress({});
    setState({ kind: "parsed", bulletin: parsed, ...analyze(parsed, pools) });
  };

  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => loadBulletin(String(reader.result), file.name);
    reader.onerror = () => setState({ kind: "error", message: `Could not read ${file.name}.` });
    reader.readAsText(file);
  };

  const settleAll = () => {
    const { bulletin, settle } = state;
    const entries = settle.map((r) => ({ region: r.region, signal: r.signal }));
    setProgress(Object.fromEntries(entries.map((e) => [e.region, { state: "pending" }])));
    return run(`Typhoon ${bulletin.typhoon}`, async () => {
      const results = await reportAndSettleMany(entries, who, (region, p) =>
        setProgress((prev) => ({ ...prev, [region]: p }))
      );
      const settled = results.filter((r) => !r.error).map((r) => r.region);
      onBulletin({ name: bulletin.typhoon, issued: bulletin.issued, signals: bulletin.signals, settled });
      setState((s) => ({ ...s, kind: "done", results }));
      return results;
    });
  };

  // island-grouped rows for the parsed table
  const grouped =
    state.kind === "parsed" || state.kind === "done"
      ? [...Object.keys(ISLANDS), "Other regions"]
          .map((island) => ({ island, rows: state.rows.filter((r) => islandOf(r.region) === island) }))
          .filter((g) => g.rows.length > 0)
      : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 28px 48px", maxWidth: 860, margin: "0 auto", width: "100%", boxSizing: "border-box", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Badge stub>demo signer — stands in for the PAGASA/JMA feed</Badge>
        <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>
          The contract never reads this file — it verifies an Ed25519 signature and compares numbers.
        </span>
      </div>

      {/* STATE: awaiting bulletin */}
      {(state.kind === "empty" || state.kind === "error") && (
        <>
          {state.kind === "error" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderRadius: 14,
                background: "var(--bad-bg)",
                border: "1px solid var(--bad-line)",
                color: "var(--bad-text)",
                font: "var(--text-fine)",
                fontWeight: 700,
              }}
            >
              <span>✕</span>
              <span>
                Couldn't read that bulletin. {state.message}{" "}
                <button
                  onClick={() => setState({ kind: "empty" })}
                  style={{ border: "none", background: "none", color: "inherit", fontWeight: 800, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  Try again
                </button>
              </span>
            </div>
          )}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) readFile(f);
            }}
            className="cel-raise"
            style={{ ...dropzoneStyle, borderColor: drag ? "var(--primary)" : "var(--outline)", background: drag ? "var(--surface-low)" : "var(--surface)" }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--primary-chip)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4m0 0 4 4m-4-4-4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <strong style={{ font: "var(--text-h2)", fontSize: 17, color: "var(--text)" }}>
              Drop a PAGASA-style bulletin here, or <span style={{ color: "var(--primary-chip)", textDecoration: "underline", textUnderlineOffset: 3 }}>browse</span>
            </strong>
            <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)", maxWidth: 460 }}>
              A JSON file with per-region typhoon signals. The app reads each region, shows which escrow pools match, and settles them one signed event per region.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <button
              onClick={() => loadBulletin(sampleBulletin(pools), "sample")}
              style={{ border: "none", background: "none", color: "var(--primary-chip)", fontWeight: 700, font: "var(--text-fine)", fontSize: 13.5, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "var(--font-sans)", padding: 0 }}
            >
              No file handy? Load the sample bulletin →
            </button>
          </div>
        </>
      )}

      {/* STATE: parsed / settling / done */}
      {(state.kind === "parsed" || state.kind === "done") && (
        <>
          <div
            className="cel-swap"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--container-highest)",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--shadow-card)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", background: "var(--surface-low)", borderBottom: "1px solid var(--container-highest)", flexWrap: "wrap" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5Z" />
              </svg>
              <strong style={{ font: "var(--text-body-lg)", fontSize: 15 }}>Typhoon {state.bulletin.typhoon}</strong>
              <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>
                issued {state.bulletin.issued || "—"} · {state.bulletin.authority || "unsigned source"}
              </span>
              <button
                onClick={() => { setState({ kind: "empty" }); setProgress({}); }}
                style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--text-faint)", fontWeight: 700, font: "var(--text-fine)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "var(--font-sans)" }}
              >
                Load a different bulletin
              </button>
            </div>

            {grouped.map((g) => (
              <div key={g.island}>
                <div style={{ padding: "8px 20px", font: "var(--text-label)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", color: "var(--text-faint)", background: "var(--paper-inset)", borderBottom: "1px solid var(--container-highest)" }}>
                  {g.island}
                </div>
                {g.rows.map((r) => {
                  const p = progress[r.region];
                  return (
                    <div key={r.region} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderBottom: "1px solid var(--surface-low)", flexWrap: "wrap" }}>
                      <span
                        style={{
                          width: 34,
                          height: 26,
                          borderRadius: 8,
                          display: "grid",
                          placeItems: "center",
                          font: "var(--text-fine)",
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                          background: r.signal >= 3 ? "var(--ok-bg)" : "var(--neutral-bg)",
                          color: r.signal >= 3 ? "var(--ok-text)" : "var(--neutral-text)",
                          border: `1px solid ${r.signal >= 3 ? "var(--ok-line)" : "var(--neutral-line)"}`,
                          flexShrink: 0,
                        }}
                      >
                        {r.signal}
                      </span>
                      <span style={{ font: "var(--text-table)", fontWeight: 700, minWidth: 200 }}>{regionName(r.region)}</span>
                      <span style={{ font: "var(--text-fine)", color: r.matching > 0 ? "var(--ok-text)" : "var(--text-faint)", fontWeight: 700 }}>
                        {r.matching > 0
                          ? `✓ ${r.matching} pool${r.matching === 1 ? "" : "s"} match — will settle`
                          : r.paused > 0
                            ? `${r.paused} pool${r.paused === 1 ? "" : "s"} paused by their funder — will skip`
                            : r.poolCount > 0
                              ? "signal below every threshold — will skip"
                              : "no pools — will skip"}
                      </span>
                      {p && (
                        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, font: "var(--text-fine)", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: p.state === "done" ? "var(--ok-text)" : p.state === "error" ? "var(--bad-text)" : "var(--text-faint)" }}>
                          {p.state === "pending" && <><span className="cel-spin" />queued…</>}
                          {p.state === "running" && <><span className="cel-spin" />signing + settling…</>}
                          {p.state === "done" && <span className="cel-pop">{`✓ event #${String(p.eventId)} · ${p.released} release${p.released === 1 ? "" : "s"}`}</span>}
                          {p.state === "error" && "✗ flagged — continuing with the rest"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {state.warnings.length > 0 && (
              <div style={{ padding: "10px 20px", background: "var(--warn-bg)", borderTop: "1px solid var(--warn-line)" }}>
                {state.warnings.map((w, i) => (
                  <div key={i} style={{ font: "var(--text-fine)", color: "var(--warn-text)", fontWeight: 700 }}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Button variant="primary" disabled={busy || state.settle.length === 0 || state.kind === "done"} onClick={settleAll}>
              {state.kind === "done" ? "Settled ✓" : `Sign & settle ${state.settle.length} region${state.settle.length === 1 ? "" : "s"} →`}
            </Button>
            <span style={{ font: "var(--text-fine)", color: "var(--text-faint)", fontWeight: 600 }}>
              Read {state.rows.length} regions · {state.settle.length} will settle · one signed event per region, unique nonces, a failed region is flagged and skipped — never the whole typhoon.
            </span>
          </div>
        </>
      )}

      {/* manual fallback — single region, the pre-bulletin path */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", font: "var(--text-fine)", fontWeight: 700, color: "var(--text-faint)" }}>
          Manual fallback — sign a single-region event
        </summary>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", padding: "16px 0 0" }}>
          <Input label="Region" type="number" min="1" value={manualRegion} onChange={(e) => setManualRegion(e.target.value)} />
          <div>
            <p style={{ margin: "0 0 5px", font: "var(--text-label)", textTransform: "uppercase", color: "var(--text-dim)" }}>Typhoon Signal</p>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setManualSignal(n)}
                  className="cel-press"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    border: "1px solid var(--outline)",
                    cursor: "pointer",
                    background: manualSignal === n ? "var(--primary)" : "var(--surface)",
                    color: manualSignal === n ? "#fff" : "var(--text)",
                    fontWeight: 700,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              run("Oracle", async () => {
                const { eventId, released } = await reportAndSettle(Number(manualRegion), Number(manualSignal), who);
                onBulletin({
                  name: `manual event #${String(eventId)}`,
                  issued: "manual trigger",
                  signals: { [Number(manualRegion)]: Number(manualSignal) },
                  settled: [Number(manualRegion)],
                });
                return { eventId, released };
              })
            }
          >
            Sign event & settle
          </Button>
        </div>
      </details>
    </div>
  );
}
