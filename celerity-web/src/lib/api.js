import { ensureGate, getGate } from "./gate";

export function encodeValue(v) {
  if (typeof v === "bigint") return { __type: "bigint", value: v.toString() };
  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(v)) {
    return { __type: "bytes", value: v.toString("base64") };
  }
  if (v instanceof Uint8Array) {
    let bin = "";
    for (let i = 0; i < v.length; i++) bin += String.fromCharCode(v[i]);
    const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(v).toString("base64");
    return { __type: "bytes", value: b64 };
  }
  if (Array.isArray(v)) return v.map(encodeValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = encodeValue(val);
    return out;
  }
  return v;
}

export function decodeValue(v) {
  if (v && typeof v === "object" && v.__type === "bigint") return BigInt(v.value);
  if (v && typeof v === "object" && v.__type === "bytes") {
    const bin = atob(v.value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (Array.isArray(v)) return v.map(decodeValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = decodeValue(val);
    return out;
  }
  return v;
}

async function apiFetch(path, { method = "GET", body, gated = false } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (gated) {
    const pin = await ensureGate();
    headers["X-Celerity-Gate"] = pin;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      // Wrong PIN — clear so the next call re-prompts.
      try {
        sessionStorage.removeItem("celerity.demoGate.v1");
      } catch {
        /* ignore */
      }
    }
    throw new Error(data.error || `API ${res.status}`);
  }
  return data;
}

export async function apiAddresses() {
  return apiFetch("/api/addresses");
}

export async function apiInvoke(role, method, args) {
  const data = await apiFetch("/api/invoke", {
    method: "POST",
    gated: true,
    body: { role, method, args: encodeValue(args || {}) },
  });
  return data.result;
}

export async function apiOracleSign(region, signal, nonce) {
  const data = await apiFetch("/api/oracle-sign", {
    method: "POST",
    gated: true,
    body: {
      region,
      signal,
      nonce: nonce != null ? String(nonce) : undefined,
    },
  });
  return {
    ...data,
    signature: decodeValue(data.signature),
    nonce: BigInt(data.nonce),
  };
}

/** For debugging — never log the PIN value in production UI. */
export function hasGateSession() {
  return Boolean(getGate());
}
