// The two demo funder institutions. ONE list drives login, the corner
// header, acting-as pills and settings — so anything ADB gets, PCIC gets:
// both are just rows here, rendered by the same components.
//
// currency: primary fiat for Create/Top-up UX. On-chain settlement is still
// the USDC stand-in (Testnet XLM); ADB enters USD, PCIC enters PHP.
export const FUNDERS = [
  {
    role: "funder",
    label: "ADB APDRF",
    desc: "Asia-Pacific Disaster Response Fund — regional multilateral funder",
    initials: "AD",
    currency: "USD",
  },
  {
    role: "funder2",
    label: "PCIC",
    desc: "Philippine Crop Insurance Corporation — state crop insurer",
    initials: "PC",
    currency: "PHP",
  },
];

export const funderByRole = (role) => FUNDERS.find((f) => f.role === role);
