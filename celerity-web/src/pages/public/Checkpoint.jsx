import React, { useEffect, useState } from "react";
import Card from "../../design/Card";
import { api } from "../../lib/api";
import { when } from "../../lib/format";

// The hash chain proves the log agrees with itself. It can't show that the
// newest entries were cut off, or that the whole log was rewritten: for that
// someone outside the app must remember an entry. This browser does. On each
// visit it checks the entry it saw last time is still there, unchanged, then
// remembers the newest one. Kept in this browser only.
const KEY = "celerity.checkpoint";

function readSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && Number.isInteger(v.seq) && typeof v.hash === "string" ? v : null;
  } catch {
    return null;
  }
}

function save(cp) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cp));
  } catch {
    // Private windows can refuse storage; the check just starts over next time.
  }
}

export default function Checkpoint({ chain }) {
  const [result, setResult] = useState(null);
  const length = chain?.length || 0;
  const head = chain?.head;

  useEffect(() => {
    if (!chain?.ok || !length || !head) return;
    let cancelled = false;
    const saved = readSaved();
    const latest = { seq: length - 1, hash: head, seen: new Date().toISOString() };
    if (!saved) {
      save(latest);
      setResult({ kind: "first", latest });
      return;
    }
    api
      .chainEntry(saved.seq)
      .then((e) => {
        if (cancelled) return;
        if (e.hash === saved.hash) {
          save(latest);
          setResult({ kind: "ok", saved, latest });
        } else setResult({ kind: "changed", saved });
      })
      .catch((err) => {
        if (cancelled) return;
        // A 404 means the entry this browser saw is gone: the log got shorter.
        if (err?.status === 404) setResult({ kind: "missing", saved });
        else setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chain?.ok, length, head]);

  if (!result) return null;
  const bad = result.kind === "changed" || result.kind === "missing";
  const text = {
    first: `This browser noted entry #${result.latest?.seq}. Next visit, it checks that entry is still here and unchanged.`,
    ok: `Entry #${result.saved?.seq}, which this browser saw ${when(result.saved?.seen)}, is still in the log and unchanged.`,
    changed: `Entry #${result.saved?.seq}, which this browser saw ${when(result.saved?.seen)}, has a different hash now. The log was rewritten.`,
    missing: `Entry #${result.saved?.seq}, which this browser saw ${when(result.saved?.seen)}, is no longer in the log. Entries were removed.`,
  }[result.kind];
  return (
    <Card variant={bad ? "notice" : "default"}>
      <strong>{bad ? "Your checkpoint does not match" : "Your checkpoint"}</strong>
      <p style={{ font: "var(--text-meta)", color: bad ? "var(--bad-text)" : "var(--text-dim)", margin: "2px 0 0" }} role={bad ? "alert" : "status"}>
        {text}
      </p>
    </Card>
  );
}
