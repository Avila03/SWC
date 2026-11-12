// Mercado Pago — Checkout API (Orders), somente server-side e somente credencial de TESTE.
// Nunca importar no navegador. Nunca registrar tokens ou respostas completas em logs.
"use strict";

const BASE = "https://api.mercadopago.com";

function testToken() {
  const token = process.env.MP_TEST_ACCESS_TOKEN;
  if (typeof token !== "string" || token.trim().length <= 20) throw new Error("mp_not_configured");
  return token.trim();
}

async function mpRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch(BASE + path, {
      method: options.method || "GET",
      headers: {
        Authorization: "Bearer " + testToken(),
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function centsToAmount(cents) {
  return (cents / 100).toFixed(2);
}

// Extrai só o necessário para exibir o Pix; não devolve o payload bruto.
function pixFromOrder(order) {
  const payment = Array.isArray(order?.transactions?.payments) ? order.transactions.payments[0] : null;
  const method = payment?.payment_method || {};
  return {
    providerOrderId: typeof order?.id === "string" ? order.id : null,
    providerPaymentId: typeof payment?.id === "string" ? payment.id : null,
    orderStatus: typeof order?.status === "string" ? order.status : null,
    statusDetail: typeof order?.status_detail === "string" ? order.status_detail : null,
    qrCode: typeof method.qr_code === "string" ? method.qr_code : null,
    qrCodeBase64: typeof method.qr_code_base64 === "string" ? method.qr_code_base64 : null,
    ticketUrl: typeof method.ticket_url === "string" && method.ticket_url.startsWith("https://") ? method.ticket_url : null,
    expiresAt: typeof payment?.date_of_expiration === "string" ? payment.date_of_expiration : null
  };
}

async function createPixOrder({ idempotencyKey, externalReference, totalCents, payer }) {
  const amount = centsToAmount(totalCents);
  const r = await mpRequest("/v1/orders", {
    method: "POST",
    idempotencyKey,
    body: {
      type: "online",
      processing_mode: "automatic",
      external_reference: externalReference,
      total_amount: amount,
      transactions: {
        payments: [{
          amount,
          payment_method: { id: "pix", type: "bank_transfer" },
          expiration_time: "PT30M"
        }]
      },
      payer: {
        email: payer.email,
        first_name: payer.firstName,
        last_name: payer.lastName || undefined,
        identification: { type: "CPF", number: payer.cpf }
      }
    }
  });
  if (r.status !== 200 && r.status !== 201) {
    const code = r.data?.errors?.[0]?.code || r.data?.error || null;
    const error = new Error("mp_create_failed");
    error.status = r.status;
    error.code = typeof code === "string" ? code.slice(0, 60) : null;
    throw error;
  }
  return pixFromOrder(r.data);
}

async function getOrder(providerOrderId) {
  if (typeof providerOrderId !== "string" || !/^[A-Za-z0-9_-]{4,80}$/.test(providerOrderId)) {
    throw new Error("invalid_provider_order_id");
  }
  const r = await mpRequest("/v1/orders/" + encodeURIComponent(providerOrderId));
  if (r.status !== 200) {
    const error = new Error("mp_get_failed");
    error.status = r.status;
    throw error;
  }
  return pixFromOrder(r.data);
}

module.exports = { createPixOrder, getOrder, isConfigured: () => {
  try { testToken(); return true; } catch { return false; }
} };
