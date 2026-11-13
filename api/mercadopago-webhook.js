// SWC — Webhook do Mercado Pago (Checkout API / Orders).
// 1. Valida a assinatura x-signature (HMAC-SHA256 com MP_WEBHOOK_SECRET).
// 2. Ignora o corpo da notificação como fonte de verdade: reconsulta a order na API do Mercado Pago.
// 3. Aplica a mudança no Supabase de forma atômica e idempotente (swc_apply_payment_update).
// Nunca registra tokens, assinatura ou dados do pagador nos logs.
"use strict";

const crypto = require("crypto");
const { getOrderStatus, isConfigured: mpConfigured } = require("../lib/mercadopago-server");
const { dbRpc, isConfigured: supabaseConfigured } = require("../lib/supabase-server");

function respond(res, status, body) { return res.status(status).json(body); }

function parseSignature(header) {
  const out = {};
  for (const part of String(header || "").split(",")) {
    const [k, ...rest] = part.split("=");
    if (k && rest.length) out[k.trim()] = rest.join("=").trim();
  }
  return /^\d{9,14}$/.test(out.ts || "") && /^[0-9a-f]{64}$/i.test(out.v1 || "") ? out : null;
}

// Manifesto oficial: id:[data.id];request-id:[x-request-id];ts:[ts]; — pares ausentes são omitidos.
function validSignature({ signature, requestId, dataId, secret }) {
  const parsed = parseSignature(signature);
  if (!parsed) return false;
  let manifest = "";
  if (dataId) manifest += "id:" + String(dataId).toLowerCase() + ";";
  if (requestId) manifest += "request-id:" + requestId + ";";
  manifest += "ts:" + parsed.ts + ";";
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex"), b = Buffer.from(parsed.v1.toLowerCase(), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Estado da order no Mercado Pago → estado do pagamento na SWC.
function mapStatus(order) {
  const p = order.paymentStatus, s = order.status, d = order.statusDetail;
  if (p === "approved" || (s === "processed" && d === "accredited")) return "approved";
  if (s === "refunded" || p === "refunded") return "refunded";
  if (s === "charged_back" || p === "charged_back") return "charged_back";
  if (p === "rejected") return "rejected";
  if (s === "canceled" || s === "cancelled" || s === "expired" || d === "expired") return "cancelled";
  if (s === "failed") return "failed";
  if (s === "processing" || p === "in_process") return "in_process";
  return "pending";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return respond(res, 405, { error: "method_not_allowed" }); }

  const secret = process.env.MP_WEBHOOK_SECRET;
  // Sem segredo configurado: responde erro para o Mercado Pago tentar de novo mais tarde.
  if (!secret || secret.length < 16 || !mpConfigured() || !supabaseConfigured()) {
    return respond(res, 503, { error: "webhook_not_configured" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const dataId = req.query?.["data.id"] || body?.data?.id || null;
  const type = req.query?.type || body?.type || null;
  const requestId = typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"].slice(0, 120) : null;

  if (!validSignature({ signature: req.headers["x-signature"], requestId, dataId, secret })) {
    return respond(res, 401, { error: "invalid_signature" });
  }
  // Só tratamos notificações de order; outras são confirmadas e ignoradas.
  if (type !== "order" || typeof dataId !== "string" || !/^[A-Za-z0-9_-]{4,80}$/.test(dataId)) {
    return respond(res, 200, { result: "ignored" });
  }

  let stage = "lookup";
  try {
    const order = await getOrderStatus(dataId);
    if (!order.id || !order.externalReference || !/^SWC-\d{6}-[A-Z0-9]{6}$/.test(order.externalReference)) {
      return respond(res, 200, { result: "ignored" });
    }
    const paymentStatus = mapStatus(order);
    stage = "apply";
    const result = await dbRpc("swc_apply_payment_update", {
      // A chave do evento é a transição de estado: a mesma transição nunca é aplicada duas vezes.
      event_key: ["order", order.id, order.status, order.statusDetail, order.paymentStatus].join(":").slice(0, 200),
      event_type: typeof body.action === "string" ? body.action.slice(0, 60) : "order",
      payload_sha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex"),
      provider_order_id: order.id,
      provider_payment_id: order.paymentId,
      external_reference: order.externalReference,
      amount_cents: order.amountCents,
      payment_status: paymentStatus,
      status_detail: order.statusDetail
    });
    // Pagamento ainda não registrado (corrida com o checkout): pede reenvio.
    if (result?.result === "retry") return respond(res, 409, { result: "retry" });
    return respond(res, 200, { result: result?.result || "processed" });
  } catch (error) {
    console.error("mp_webhook_failed", stage, error?.message, error?.status || null, error?.code || null);
    return respond(res, 500, { error: "processing_failed" });
  }
};

module.exports.validSignature = validSignature;
module.exports.mapStatus = mapStatus;
