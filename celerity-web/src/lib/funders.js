// The two demo funder institutions. ONE list drives login, the corner
// header, acting-as pills and settings — so anything ADB gets, PCIC gets:
// both are just rows here, rendered by the same components.
export const FUNDERS = [
  {
    role: "funder",
    label: "ADB APDRF",
    desc: "Asia-Pacific Disaster Response Fund — regional multilateral funder",
    initials: "AD",
  },
  {
    role: "funder2",
    label: "PCIC",
    desc: "Philippine Crop Insurance Corporation — state crop insurer",
    initials: "PC",
  },
];

export const funderByRole = (role) => FUNDERS.find((f) => f.role === role);
