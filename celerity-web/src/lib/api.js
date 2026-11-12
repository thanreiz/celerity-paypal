// Browser client for the Celerity Relief API (server/). The coordinator key
// lives in sessionStorage so closing the tab signs you out.

const KEY_STORAGE = "celerity.coordinatorKey";
const NAME_STORAGE = "celerity.coordinatorName";

function read(storage, key) {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}
function write(storage, key, value) {
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    /* private mode: stay signed in for this page load only */
  }
}

let memoryKey = read(sessionStorage, KEY_STORAGE);
let memoryName = read(localStorage, NAME_STORAGE);

export const session = {
  get key() {
    return memoryKey;
  },
  get name() {
    return memoryName;
  },
  signIn(key, name) {
    memoryKey = key;
    memoryName = name;
    write(sessionStorage, KEY_STORAGE, key);
    write(localStorage, NAME_STORAGE, name);
  },
  signOut() {
    memoryKey = "";
    write(sessionStorage, KEY_STORAGE, "");
  },
};

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Coordinator routes get the key and name headers; public, funder and farmer
// requests never carry them. The name is percent-encoded because a header
// value with a character above U+00FF (an em dash, an emoji) makes fetch
// throw; the server decodes it. The stored name stays as typed.
async function request(path, { method = "GET", body, coordinator = false, headers: extra } = {}) {
  const headers = { Accept: "application/json", ...extra };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (coordinator) {
    if (memoryKey) headers["x-coordinator-key"] = memoryKey;
    if (memoryName) headers["x-coordinator-name"] = encodeURIComponent(memoryName);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("Can't reach the Celerity server. Check your connection.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

// Funder sessions: a short-lived token per funder, kept in sessionStorage
// (never in a URL) and sent as x-funder-token. An access code, when a
// deployment requires one, is held in memory only so renewals can reuse it.
const FUNDER_TOKEN = "celerity.funderToken.";
const funderCodes = new Map();
const memoryTokens = new Map();

function cachedFunderToken(id) {
  let t = memoryTokens.get(id);
  if (!t) {
    try {
      t = JSON.parse(sessionStorage.getItem(FUNDER_TOKEN + id) || "null");
    } catch {
      t = null;
    }
  }
  if (!t?.token) return "";
  const expires = Date.parse(t.expires_at);
  // Renew a little early so a request does not race the expiry.
  if (Number.isFinite(expires) && expires - Date.now() < 15000) return "";
  return t.token;
}

function forgetFunderToken(id) {
  memoryTokens.delete(id);
  try {
    sessionStorage.removeItem(FUNDER_TOKEN + id);
  } catch {
    /* private mode */
  }
}

async function openFunderSession(id, code) {
  if (code !== undefined) funderCodes.set(id, code);
  const given = funderCodes.get(id);
  const out = await request(`/api/funders/${encodeURIComponent(id)}/session`, { method: "POST", body: given ? { code: given } : {} });
  const t = { token: out.token, expires_at: out.expires_at };
  memoryTokens.set(id, t);
  try {
    sessionStorage.setItem(FUNDER_TOKEN + id, JSON.stringify(t));
  } catch {
    /* kept in memory for this page load */
  }
  return t.token;
}

async function funderRequest(id, path, opts = {}) {
  const send = (token) => request(path, { ...opts, headers: { "x-funder-token": token } });
  const token = cachedFunderToken(id) || (await openFunderSession(id));
  try {
    return await send(token);
  } catch (e) {
    if (e.status !== 401) throw e;
    // One fresh session and one retry; a second failure signs the funder out.
    forgetFunderToken(id);
    return send(await openFunderSession(id));
  }
}

export const api = {
  config: () => request("/api/config"),
  state: () => request("/api/state", { coordinator: true }),
  publicView: () => request("/api/public"),
  chainEntry: (seq) => request(`/api/chain/${seq}`),
  addFamily: (family) => request("/api/families", { method: "POST", body: family, coordinator: true }),
  setFamilyStatus: (id, status) => request(`/api/families/${id}`, { method: "PATCH", body: { status }, coordinator: true }),
  addBulletin: (title, text) => request("/api/bulletins", { method: "POST", body: { title, text }, coordinator: true }),
  startRun: (bulletinId, mode) => request(`/api/bulletins/${bulletinId}/runs`, { method: "POST", body: mode ? { mode } : {}, coordinator: true }),
  approveRun: (runId) => request(`/api/runs/${runId}/approve`, { method: "POST", coordinator: true }),
  removeDraft: (runId, familyId) => request(`/api/runs/${runId}/drafts/${familyId}`, { method: "DELETE", coordinator: true }),
  rejectRun: (runId, reason) => request(`/api/runs/${runId}/reject`, { method: "POST", body: { reason }, coordinator: true }),
  pools: () => request("/api/pools"),
  farmer: (token) => request(`/api/me/${encodeURIComponent(token)}`),
  createPool: (pool) => request("/api/pools", { method: "POST", body: pool, coordinator: true }),
  fundPool: (poolId, funder_name, amount, return_to) =>
    request(`/api/pools/${poolId}/fund`, { method: "POST", body: { funder_name, amount, ...(return_to ? { return_to } : {}) } }),
  // Funder app
  funders: () => request("/api/funders"),
  forgetFunder: (id) => forgetFunderToken(id),
  funderSession: (id, code) => openFunderSession(id, code),
  funder: (id) => funderRequest(id, `/api/funders/${encodeURIComponent(id)}`),
  draftPool: (id, text) => funderRequest(id, `/api/funders/${encodeURIComponent(id)}/pool-drafts`, { method: "POST", body: { text } }),
  createFunderPool: (id, pool) => funderRequest(id, `/api/funders/${encodeURIComponent(id)}/pools`, { method: "POST", body: pool }),
  // Farmer app
  demoFarmers: () => request("/api/demo/farmers"),
  help: (token, messages) => request(`/api/me/${encodeURIComponent(token)}/help`, { method: "POST", body: { messages } }),
  refreshBatch: (batchId) => request(`/api/batches/${batchId}/refresh`, { method: "POST", coordinator: true }),
};
