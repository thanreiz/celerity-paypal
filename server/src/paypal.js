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
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PayPalError(`PayPal OAuth failed: ${body.error_description || res.statusText}`, {
      status: res.status,
      name: body.error,
    });
  }
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

async function call(method, path, { body, requestId } = {}) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (requestId) headers["PayPal-Request-Id"] = requestId;

  const res = await fetch(`${paypalBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new PayPalError(json.message || `PayPal ${method} ${path} failed (${res.status})`, {
      status: res.status,
      name: json.name,
      details: json.details,
      debugId: json.debug_id || res.headers.get("paypal-debug-id"),
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

export async function getPayoutBatch(payoutBatchId) {
  return call("GET", `/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}?page_size=1000`);
}

/**
 * Ask PayPal whether a webhook delivery is genuine. Returns true only on
 * verification_status === "SUCCESS".
 */
export async function verifyWebhookSignature(headers, event) {
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
      body: { ...signed, webhook_id: config.paypal.webhookId, webhook_event: event },
    });
    return result.verification_status === "SUCCESS";
  } catch (e) {
    // PayPal answers malformed signature data with a 400; that is a failed check.
    if (e instanceof PayPalError && e.status === 400) return false;
    throw e;
  }
}
