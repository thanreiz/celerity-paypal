// Thin PayPal REST client: OAuth client-credentials, Payouts, webhook
// signature verification. Uses Node's built-in fetch, no SDK.

import { config, paypalBaseUrl } from "./config.js";

export class PayPalError extends Error {
  constructor(message, { status, name, details, debugId } = {}) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.paypalName = name;
    this.details = details;
    this.debugId = debugId;
  }
}

let cachedToken = null; // { value, expiresAt }

// A hung PayPal request must fail well inside Vercel's function time limit.
const TIMEOUT_MS = 20_000;

export function paypalConfigured() {
  return Boolean(config.paypal.clientId && config.paypal.clientSecret);
}

export async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  if (!paypalConfigured()) {
    throw new PayPalError("PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
  }
  const basic = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = parseBody(await res.text().catch(() => "")) || {};
  if (!res.ok) {
    throw new PayPalError(`PayPal OAuth failed: ${body.error_description || res.statusText}`, {
      status: res.status,
      name: body.error,
    });
  }
  if (!body.access_token) throw new PayPalError("PayPal OAuth answered without an access token", { status: res.status });
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

// PayPal's answers are JSON, but a gateway in front of it can answer with an
// HTML 502 page. Parse defensively so the caller always gets a PayPalError
// with the HTTP status instead of a SyntaxError.
function parseBody(text) {
  if (!text) return {};
  try {
    const json = JSON.parse(text);
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

async function call(method, path, { body, rawBody, requestId } = {}, retried = false) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined || rawBody !== undefined) headers["Content-Type"] = "application/json";
  if (requestId) headers["PayPal-Request-Id"] = requestId;

  const res = await fetch(`${paypalBaseUrl()}${path}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // The cached token can be revoked or expire early. A 401 means PayPal did
  // nothing with the call, so fetch a fresh token and send it once more.
  if (res.status === 401 && !retried) {
    cachedToken = null;
    return call(method, path, { body, rawBody, requestId }, true);
  }
  const text = await res.text();
  const json = parseBody(text);
  if (!res.ok) {
    throw new PayPalError(json?.message || `PayPal ${method} ${path} failed (${res.status})`, {
      status: res.status,
      name: json?.name,
      details: json?.details,
      debugId: json?.debug_id || res.headers.get("paypal-debug-id"),
    });
  }
  if (json === null) {
    throw new PayPalError(`PayPal ${method} ${path} answered with something that is not JSON (${res.status})`, {
      status: res.status,
      debugId: res.headers.get("paypal-debug-id"),
    });
  }
  return json;
}

/** Format a number as a PayPal amount string ("25.00"). */
export function money(value) {
  return Number(value).toFixed(2);
}

/**
 * Create a Payouts batch. PayPal rejects a reused sender_batch_id for 30
 * days, so a run can never be paid twice. `requestId` (PayPal-Request-Id)
 * makes a resent request return the original answer instead of an error.
 */
export async function createPayoutBatch({ senderBatchId, requestId = senderBatchId, emailSubject, emailMessage, items }) {
  return call("POST", "/v1/payments/payouts", {
    requestId,
    body: {
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: emailSubject,
        email_message: emailMessage,
      },
      items: items.map((it) => ({
        recipient_type: "EMAIL",
        receiver: it.receiver,
        amount: { value: money(it.amount), currency: it.currency },
        note: it.note,
        sender_item_id: it.senderItemId,
      })),
    },
  });
}

// --- Checkout (Orders v2): how funders put money into a pool -----------------

/** Create an order the funder approves on PayPal. Returns its id and the
 * PayPal page to send them to. */
export async function createOrder({ amount, currency, poolId, poolName, returnUrl, cancelUrl, requestId }) {
  const order = await call("POST", "/v2/checkout/orders", {
    requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: poolId,
          description: `Celerity Relief: ${poolName}`.slice(0, 127),
          amount: { currency_code: currency, value: money(amount) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Celerity Relief",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
  });
  const approveUrl = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!approveUrl) throw new PayPalError("PayPal returned no approval link for the order");
  return { id: order.id, approveUrl };
}

/** The first capture of an order, in a flat shape. */
/** PayPal's fee and what reaches our balance, from a capture's
 * seller_receivable_breakdown (absent while a capture is pending). */
export function feeOf(capture) {
  const b = capture?.seller_receivable_breakdown;
  return { net: b?.net_amount?.value ?? null, fee: b?.paypal_fee?.value ?? null };
}

function captureOf(order) {
  const c = order.purchase_units?.[0]?.payments?.captures?.[0];
  return c
    ? { orderId: order.id, captureId: c.id, status: c.status, amount: c.amount?.value, currency: c.amount?.currency_code, ...feeOf(c) }
    : { orderId: order.id, captureId: null, status: order.status, amount: null, currency: null };
}

/** Capture an approved order. An order captured already (a reload of the
 * return page, or the webhook got there first) is read back instead. */
export async function captureOrder(orderId) {
  const path = `/v2/checkout/orders/${encodeURIComponent(orderId)}`;
  try {
    return captureOf(await call("POST", `${path}/capture`, { body: {}, requestId: `capture-${orderId}` }));
  } catch (e) {
    const already = e instanceof PayPalError && e.status === 422 && JSON.stringify(e.details || "").includes("ORDER_ALREADY_CAPTURED");
    if (!already) throw e;
    return captureOf(await call("GET", path));
  }
}

export async function getPayoutBatch(payoutBatchId) {
  return call("GET", `/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}?page_size=1000`);
}

/**
 * Ask PayPal whether a webhook delivery is genuine. Returns true only on
 * verification_status === "SUCCESS".
 */
/** The JSON for verify-webhook-signature, with webhook_event spliced in as
 * the exact text PayPal delivered when we have it (and it parses), so the
 * signed bytes reach PayPal unchanged. */
export function verificationBody(signed, event, rawEvent) {
  const head = JSON.stringify({ ...signed, webhook_id: config.paypal.webhookId });
  let raw = null;
  if (typeof rawEvent === "string") {
    try {
      JSON.parse(rawEvent);
      raw = rawEvent.trim();
    } catch {
      raw = null;
    }
  }
  return `${head.slice(0, -1)},"webhook_event":${raw ?? JSON.stringify(event)}}`;
}

export async function verifyWebhookSignature(headers, event, rawEvent = null) {
  const h = (k) => headers[k] || headers[k.toLowerCase()];
  const signed = {
    auth_algo: h("paypal-auth-algo"),
    cert_url: h("paypal-cert-url"),
    transmission_id: h("paypal-transmission-id"),
    transmission_sig: h("paypal-transmission-sig"),
    transmission_time: h("paypal-transmission-time"),
  };
  // Unsigned requests can't be PayPal; don't spend a PayPal call on them.
  if (Object.values(signed).some((v) => !v)) return false;
  try {
    const result = await call("POST", "/v1/notifications/verify-webhook-signature", {
      rawBody: verificationBody(signed, event, rawEvent),
    });
    return result.verification_status === "SUCCESS";
  } catch (e) {
    // PayPal answers malformed signature data with a 400; that is a failed check.
    if (e instanceof PayPalError && e.status === 400) return false;
    throw e;
  }
}
