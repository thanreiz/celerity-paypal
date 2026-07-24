/** Encode values for JSON transport (BigInt + bytes). */
export function encodeValue(v) {
  if (typeof v === "bigint") return { __type: "bigint", value: v.toString() };
  if (Buffer.isBuffer(v)) return { __type: "bytes", value: v.toString("base64") };
  if (v instanceof Uint8Array) return { __type: "bytes", value: Buffer.from(v).toString("base64") };
  if (Array.isArray(v)) return v.map(encodeValue);
  if (v && typeof v === "object") {
    // Soroban SDK result objects may carry .tag unions — stringify via JSON with replacer fallback
    if (typeof v.toString === "function" && v.constructor?.name === "Address") {
      return String(v);
    }
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = encodeValue(val);
    return out;
  }
  return v;
}

export function decodeValue(v) {
  if (v && typeof v === "object" && v.__type === "bigint") return BigInt(v.value);
  if (v && typeof v === "object" && v.__type === "bytes") return Buffer.from(v.value, "base64");
  if (Array.isArray(v)) return v.map(decodeValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = decodeValue(val);
    return out;
  }
  return v;
}

/** Best-effort JSON for contract return values (BigInt → string). */
export function jsonSafe(v) {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val))
  );
}
