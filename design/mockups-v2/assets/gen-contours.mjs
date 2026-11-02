// Flowing contour ribbons (after the Creator Loans hero lines): bundles of thin
// lines whose phase drifts line to line, so each bundle twists like silk.
import { writeFileSync } from "node:fs";
const out = process.argv[2];
const W = 1200, H = 600, r1 = n => Math.round(n * 10) / 10;
function bundle({ y, lines, gap, a1, f1, a2, f2, twist, seed }) {
  const res = [];
  for (let j = 0; j < lines; j++) {
    const ph = seed + j * twist;
    let d = "";
    for (let s = 0; s <= 160; s++) {
      const x = -60 + (s / 160) * (W + 120), u = x / W;
      const yy = y + j * gap + a1 * Math.sin(u * Math.PI * f1 + ph) + a2 * Math.sin(u * Math.PI * f2 - ph * 1.7);
      d += `${s ? "L" : "M"}${r1(x)} ${r1(yy)}`;
    }
    res.push(`<path vector-effect="non-scaling-stroke" d="${d}"/>`);
  }
  return res.join("");
}
const B = [
  { y: 40,  lines: 16, gap: 5,  a1: 46, f1: 2.2, a2: 14, f2: 5.5, twist: .09, seed: 0 },
  { y: 250, lines: 18, gap: 4.5, a1: 60, f1: 1.6, a2: 18, f2: 4.2, twist: .12, seed: 2.1 },
  { y: 450, lines: 14, gap: 6,  a1: 40, f1: 2.8, a2: 12, f2: 6.4, twist: .08, seed: 4.4 },
];
const svg = (stroke, op) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="1" vector-effect="non-scaling-stroke">${B.map(bundle).join("")}</svg>`;
writeFileSync(`${out}/contours-white.svg`, svg("#ffffff", 1));
writeFileSync(`${out}/contours-green.svg`, svg("#0e8a52", 1));
