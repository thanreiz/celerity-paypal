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

async function request(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (memoryKey) headers["x-coordinator-key"] = memoryKey;
  if (memoryName) headers["x-coordinator-name"] = memoryName;
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

export const api = {
  config: () => request("/api/config"),
  state: () => request("/api/state"),
  publicView: () => request("/api/public"),
  addFamily: (family) => request("/api/families", { method: "POST", body: family }),
  setFamilyStatus: (id, status) => request(`/api/families/${id}`, { method: "PATCH", body: { status } }),
  addBulletin: (title, text) => request("/api/bulletins", { method: "POST", body: { title, text } }),
  startRun: (bulletinId) => request(`/api/bulletins/${bulletinId}/runs`, { method: "POST" }),
  approveRun: (runId) => request(`/api/runs/${runId}/approve`, { method: "POST" }),
  removeDraft: (runId, familyId) => request(`/api/runs/${runId}/drafts/${familyId}`, { method: "DELETE" }),
  rejectRun: (runId, reason) => request(`/api/runs/${runId}/reject`, { method: "POST", body: { reason } }),
  pools: () => request("/api/pools"),
  createPool: (pool) => request("/api/pools", { method: "POST", body: pool }),
  fundPool: (poolId, funder_name, amount) => request(`/api/pools/${poolId}/fund`, { method: "POST", body: { funder_name, amount } }),
  refreshBatch: (batchId) => request(`/api/batches/${batchId}/refresh`, { method: "POST" }),
};
