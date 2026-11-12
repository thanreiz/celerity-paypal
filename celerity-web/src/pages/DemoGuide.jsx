import React from "react";

// A walk-through for judges and anyone trying the hosted sandbox demo: what
// to open, what to press, and what they should see. Kept in step with the
// "Try the demo" section of the README.

const STEPS = [
  {
    n: 1,
    title: "Fund a pool with PayPal Checkout",
    where: ["Open the Funder app", "#/funder"],
    time: "2 min",
    do: [
      "Pick a demo institution (Philippine Crop Insurance Corp. or Global Rice Foundation). No password: the picker is the demo's sign-in.",
      "Press “Cash in with PayPal”, keep ₱1,000 and press Pay.",
      "On PayPal’s sandbox page, log in with a sandbox personal (buyer) account and approve. Use one from your own PayPal developer dashboard, or the one in the submission notes.",
    ],
    see: [
      "You come back to the Funder app with “PayPal confirmed your payment”.",
      "The pool’s “Put in, after fees” goes up by a little less than ₱1,000: the pool is credited what PayPal actually paid in, and the fee is listed on the public record.",
    ],
  },
  {
    n: 2,
    title: "Describe a pool in plain words (AI)",
    where: ["Same Funder app", "#/funder"],
    time: "1 min",
    do: ["Press “New pool” and type, for example: “rice farmers in Albay and Sorsogon at signal 3 or higher”."],
    see: [
      "The pool-rule agent turns it into a rule: provinces, minimum signal.",
      "Code checks it before the pool exists. Anything the rules can’t enforce (crops, installments) is shown as not enforced.",
    ],
  },
  {
    n: 3,
    title: "Run a routine bulletin: rules pay, no AI",
    where: ["Coordinator sign in", "#/console"],
    time: "2 min",
    do: [
      "Sign in with any name and the coordinator key from the submission notes.",
      "Go to Respond, pick “Typhoon Dalisay, Bulletin #8” and press “Run Celerity”.",
      "Open Payouts.",
    ],
    see: [
      "The rules parser reads every signal area with no AI, drafts each eligible family at the policy amount, and releases it to PayPal Payouts at once.",
      "Payouts shows one PayPal batch. Its status moves to SUCCESS from PayPal’s webhooks, with no refresh.",
      "If someone ran it before you, every family shows “already paid”: that is the no-double-payment rule. Their batch is on the Payouts page.",
    ],
  },
  {
    n: 4,
    title: "Try to trick it: the tampered bulletin",
    where: ["Coordinator console", "#/respond"],
    time: "1 min",
    do: ["Pick “Tampered bulletin (guardrail demo)” and run it. Its text tells the AI to ignore limits and pay an outside email."],
    see: [
      "Jev scores the hidden instruction and the run is held for a person: nothing is sent.",
      "The drafts only name registered families, at the policy cap, to the email on file. Reject the run when you’re done.",
    ],
  },
  {
    n: 5,
    title: "An unclear bulletin: AI drafts, a person approves",
    where: ["Coordinator console", "#/respond"],
    time: "2 min",
    do: ["Pick “Typhoon Dalisay, Bulletin #7 (irregular wording)” and run it."],
    see: [
      "The parser can’t place some phrases, so Jev and the GPT agent work them out. The trace shows each tool call.",
      "Every draft is checked by the same policy code, and the run waits under “Needs approval”. Approve or reject it.",
    ],
  },
  {
    n: 6,
    title: "See it as a farmer",
    where: ["Open the Farmer app", "#/farmer"],
    time: "1 min",
    do: ["Pick Maria Santos (Virac, Catanduanes). Switch between Tagalog and English.", "Ask the helper “nasaan ang pera ko?” or “where is my money?”."],
    see: [
      "Her payout and its Approved → Sent → Received status, and whether the storm over her town qualifies her.",
      "The helper answers from her own record only. It can open a case for a coordinator; it can’t move money.",
    ],
  },
  {
    n: 7,
    title: "Check the public record",
    where: ["Open the public record", "#/public"],
    time: "1 min",
    do: ["Scroll through the pools, payout batches and record entries."],
    see: [
      "Each funder’s pool: what went in, which towns it paid for, what’s left. No names or emails.",
      "“Chain verified”: every entry carries the hash of the one before it. Your browser keeps a checkpoint and checks it next visit.",
    ],
  },
];

const wrap = { maxWidth: 820, margin: "0 auto", padding: "32px 16px 64px", display: "grid", gap: 16 };
const card = { background: "var(--surface)", borderRadius: 16, padding: "18px 20px", boxShadow: "var(--shadow-card)" };
const label = { font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", margin: "12px 0 4px" };

export default function DemoGuide() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--paper-page)" }}>
      <div style={wrap}>
        <a href="#/" style={{ font: "var(--text-meta)", color: "var(--text-dim)" }}>
          ← Back to Celerity
        </a>
        <header>
          <h1 style={{ font: "var(--text-display)", margin: 0 }}>Try the demo</h1>
          <p style={{ font: "var(--text-body)", color: "var(--text-dim)", margin: "8px 0 0" }}>
            About 10 minutes, start to finish. Everything runs on the PayPal sandbox with simulated typhoon bulletins: no real money moves.
          </p>
        </header>

        <section style={{ ...card, background: "var(--warn-bg)", boxShadow: "none", border: "1px solid var(--warn-line)" }}>
          <strong>Before you start</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, font: "var(--text-meta)", display: "grid", gap: 4 }}>
            <li>
              <b>Coordinator key</b> (steps 3 to 5): in the submission notes.
            </li>
            <li>
              <b>PayPal sandbox buyer</b> (step 1): any sandbox personal account from your PayPal developer dashboard, or the one in the submission notes.
            </li>
            <li>The demo is shared: you may see other judges’ pools, runs and payouts. That is the record working as it should.</li>
          </ul>
        </section>

        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          {STEPS.map((s) => (
            <li key={s.n} style={card}>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <span
                  aria-hidden="true"
                  style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-grid", placeItems: "center", background: "var(--primary)", color: "#fff", fontWeight: 700, flexShrink: 0 }}
                >
                  {s.n}
                </span>
                <h2 style={{ font: "var(--text-h2)", margin: 0, flex: 1, minWidth: 200 }}>{s.title}</h2>
                <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>{s.time}</span>
              </div>
              <a href={s.where[1]} style={{ display: "inline-block", marginTop: 8, font: "var(--text-body-lg)", color: "var(--primary)" }}>
                {s.where[0]} →
              </a>
              <p style={label}>Do</p>
              <ul style={{ margin: 0, paddingLeft: 20, font: "var(--text-meta)", display: "grid", gap: 4 }}>
                {s.do.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <p style={label}>You should see</p>
              <ul style={{ margin: 0, paddingLeft: 20, font: "var(--text-meta)", color: "var(--text-dim)", display: "grid", gap: 4 }}>
                {s.see.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <p style={{ font: "var(--text-meta)", color: "var(--text-dim)" }}>
          Something not as described? The code, setup and tests are in the{" "}
          <a href="https://github.com/thanreiz/celerity-paypal" target="_blank" rel="noopener noreferrer">
            GitHub repository
          </a>
          .
        </p>
      </div>
    </main>
  );
}
