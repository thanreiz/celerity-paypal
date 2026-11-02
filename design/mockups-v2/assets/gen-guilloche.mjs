import { writeFileSync } from "node:fs";
const out = process.argv[2];
const r1 = n => Math.round(n * 10) / 10;
const W = 800, H = 460;
function rosette(rings = 22, lobes = 18) {
  const res = [];
  for (let j = 0; j < rings; j++) {
    const base = 90 + j * 9, amp = 14 + j * 0.6, ph = (j * Math.PI) / 11;
    let d = "";
    for (let s = 0; s <= 300; s++) {
      const t = (s / 300) * Math.PI * 2, rad = base + amp * Math.sin(lobes * t + ph);
      d += `${s ? "L" : "M"}${r1(rad * Math.cos(t))} ${r1(rad * Math.sin(t))}`;
    }
    res.push(d + "Z");
  }
  return res;
}
function waves(lines = 14, y0b = 24, gap = 7) {
  const res = [];
  for (let j = 0; j < lines; j++) {
    const y0 = y0b + j * gap, ph = j * 0.45;
    let d = "";
    for (let s = 0; s <= 140; s++) {
      const x = -40 + (s / 140) * (W + 80);
      const y = y0 + 16 * Math.sin((x / W) * Math.PI * 5 + ph) + 6 * Math.sin((x / W) * Math.PI * 13 - ph);
      d += `${s ? "L" : "M"}${r1(x)} ${r1(y)}`;
    }
    res.push(d);
  }
  return res;
}
const ROS = rosette();
const ros = (x, y, sc = 1) => `<g transform="translate(${x} ${y}) scale(${sc})">${ROS.map(d => `<path d="${d}"/>`).join("")}</g>`;
const svg = (stroke, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" fill="none" stroke="${stroke}" stroke-width="0.6">${body}</svg>`;
// Hero: waves across the top third + low-right rosette + small top-left rosette
const heroBody = `<g>${waves().map(d => `<path d="${d}"/>`).join("")}</g><g transform="translate(0 250)">${waves(10, 24, 8).map(d => `<path d="${d}" opacity=".55"/>`).join("")}</g>${ros(740, 440)}${ros(-30, -40, 0.75)}`;
writeFileSync(`${out}/guilloche-white.svg`, svg("#ffffff", heroBody));
writeFileSync(`${out}/guilloche-green.svg`, svg("#0b7a49", heroBody));
// Corner rosette only, for white cards
writeFileSync(`${out}/rosette-green.svg`, svg("#0b7a49", ros(800, 460, 1.1)));
writeFileSync(`${out}/rosette-white.svg`, svg("#ffffff", ros(800, 460, 1.1) + ros(0, 0, .6)));
// Quilt lattice
writeFileSync(`${out}/quilt-white.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><g transform="rotate(45 28 28)" fill="none" stroke="#fff"><path d="M-40 28H96M28 -40V96" stroke-width="1"/><path d="M-40 31H96M-40 25H96M31 -40V96M25 -40V96" stroke-width=".6" stroke-dasharray="2 4" opacity=".6"/></g><circle cx="28" cy="28" r="1.6" fill="#fff"/></svg>`);
// Grain
writeFileSync(`${out}/grain.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`);
