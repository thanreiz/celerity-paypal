import React from "react";

/** Restrained data-table: uppercase 12px headers, hairline row rules, row
 * hover tint, bold tabular amounts, "mine" mint highlight for the current
 * user's rows, and an emptyText state that says what will appear there. This
 * is the ONE table style in Celerity — do not create a second. */
export default function Table({ columns, rows, emptyText = "Nothing here yet.", rowKey = (r, i) => i, mineKey }) {
  return (
    <div className="cel-table-scroll">
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480, fontFamily: "var(--font-sans)" }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                textAlign: "left",
                color: "var(--text-faint)",
                font: "var(--text-label)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-label)",
                padding: "10px 12px",
                borderBottom: "1px solid var(--container-highest)",
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} style={{ color: "var(--text-faint)", textAlign: "center", padding: "20px 12px" }}>
              {emptyText}
            </td>
          </tr>
        )}
        {rows.map((row, i) => (
          <tr
            key={rowKey(row, i)}
            className="cel-row"
            style={{
              background: mineKey && mineKey(row) ? "rgba(232,245,233,0.55)" : "transparent",
              animation: "celFadeUp 420ms cubic-bezier(.2,.7,.2,1) both",
              animationDelay: `${Math.min(i, 12) * 35}ms`,
            }}
          >
            {columns.map((c) => (
              <td
                key={c.key}
                style={{
                  padding: 12,
                  borderBottom: "1px solid var(--surface-low)",
                  font: "var(--text-table)",
                  fontWeight: c.num ? 700 : 500,
                  fontVariantNumeric: c.num ? "tabular-nums" : "normal",
                }}
              >
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
