// SWC — Checkout Pix em AMBIENTE DE TESTE.
// Cria o pedido no Supabase (transacional e idempotente) e gera a cobrança Pix de teste no Mercado Pago.
// Desligado por padrão: só responde quando SWC_TEST_CHECKOUT=enabled no Vercel.
// O retorno do navegador NUNCA confirma pagamento; a confirmação virá do webhook assinado.
"use strict";

const { availableVariants, quoteShipping } = require("../lib/gubo-server");
const { priceItems } = require("../lib/cart-server");
const { dbRpc, dbRequest, isConfigured: supabaseConfigured } = require("../lib/supabase-server");
const { createPixOrder, getOrder, isConfigured: mpConfigured } = require("../lib/mercadopago-server");

const UF = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const usage = new Map();

function respond(res, status, body) { return res.status(status).json(body); }

function limited(req) {
  const id = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "unknown").split(",")[0].slice(0, 90);
  const now = Date.now();
  const list = (usage.get(id) || []).filter(t => now - t < 60000);
  list.push(now); usage.set(id, list);
  if (usage.size > 250) for (const [k, v] of usage) if (!v.length || now - v[v.length - 1] > 60000) usage.delete(k);
  return list.length > 5;
}

function text(value, min, max) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  return clean.length >= min && clean.length <= max ? clean : null;
}

function validCpf(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(cpf[len])) return false;
  }
  return true;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "invalid_request" };
  const idempotencyKey = typeof input.idempotencyKey === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey)
    ? input.idempotencyKey.toLowerCase() : null;
  if (!idempotencyKey) return { error: "invalid_idempotency_key" };
  if (input.consent !== true) return { error: "consent_required" };

  const c = input.customer || {};
  const name = text(c.name, 5, 120);
  const email = typeof c.email === "string" && c.email.length <= 160 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim()) ? c.email.trim().toLowerCase() : null;
  const phone = String(c.phone || "").replace(/\D/g, "");
  const cpf = String(c.cpf || "").replace(/\D/g, "");
  if (!name || !name.includes(" ")) return { error: "invalid_name" };
  if (!email) return { error: "invalid_email" };
  if (!/^\d{10,11}$/.test(phone)) return { error: "invalid_phone" };
  if (!validCpf(cpf)) return { error: "invalid_cpf" };

  const a = input.address || {};
  const cep = String(a.cep || "").replace(/\D/g, "");
  const address = {
    street: text(a.street, 2, 120),
    number: text(a.number, 1, 12),
    complement: a.complement ? text(a.complement, 1, 80) : null,
    district: text(a.district, 2, 80),
    city: text(a.city, 2, 80),
    state: typeof a.state === "string" && UF.has(a.state.toUpperCase()) ? a.state.toUpperCase() : null
  };
  if (!/^\d{8}$/.test(cep)) return { error: "invalid_cep" };
  if (!address.street || !address.number || !address.district || !address.city || !address.state ||
      (a.complement && !address.complement)) return { error: "invalid_address" };

  const service = typeof input.shippingService === "string" && /^[A-Za-z0-9._:-]{1,60}$/.test(input.shippingService)
    ? input.shippingService : null;
  if (!service) return { error: "invalid_shipping_service" };

  return { idempotencyKey, name, email, phone, cpf, cep, address, service, items: input.items };
}

function pixResponse(order, pix) {
  return {
    status: "awaiting_payment",
    sandbox: true,
    orderReference: order.order_reference,
    totalCents: order.total_cents,
    pix: {
      qrCode: pix.qrCode,
      qrCodeBase64: pix.qrCodeBase64,
      ticketUrl: pix.ticketUrl,
      expiresAt: pix.expiresAt
    },
    message: "Pix de teste gerado. A confirmação do pagamento só acontece pelo webhook do Mercado Pago."
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return respond(res, 405, { error: "method_not_allowed" }); }

  // Trava principal: sem a flag explícita, nenhum pedido é criado.
  if (process.env.SWC_TEST_CHECKOUT !== "enabled") return respond(res, 503, { error: "checkout_disabled" });
  const guboKey = process.env.GUBO_ORDERS_API_KEY;
  if (!guboKey || !guboKey.startsWith("gubo_test_") || !supabaseConfigured() || !mpConfigured()) {
    return respond(res, 503, { error: "test_mode_not_configured" });
  }
  if (limited(req)) return respond(res, 429, { error: "too_many_requests" });
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) return respond(res, 415, { error: "json_required" });
  if (Number(req.headers["content-length"] || 0) > 6000) return respond(res, 413, { error: "payload_too_large" });

  const input = validateInput(req.body);
  if (input.error) return respond(res, 422, { error: input.error });
  const priced = priceItems(input.items);
  if (priced.error) return respond(res, 422, { error: priced.error });

  let stage = "catalog";
  try {
    // 1. Revalida variantes e frete diretamente na Gubo (preço do navegador é ignorado).
    const variants = await availableVariants(guboKey);
    if (priced.lines.some(l => !variants.has(l.sku))) return respond(res, 422, { error: "variant_unavailable" });
    stage = "quote";
    const quote = await quoteShipping(guboKey, input.cep, priced.lines.map(l => ({ sku: l.sku, quantidade: l.quantity })));
    if (quote.state === "pending") return respond(res, 202, { status: "pending", error: "quote_pending" });
    if (quote.state !== "ready") return respond(res, 502, { error: "gubo_quote_failed" });
    const shipping = quote.options.find(o => o.service === input.service);
    if (!shipping) return respond(res, 409, { error: "shipping_option_changed" });

    // 2. Pedido transacional e idempotente no Supabase.
    stage = "order";
    const order = await dbRpc("swc_create_order", {
      idempotency_key: input.idempotencyKey,
      environment: "test",
      customer_name: input.name,
      customer_email: input.email,
      customer_phone: input.phone,
      customer_document: input.cpf,
      shipping_address: input.address,
      shipping_postal_code: input.cep,
      shipping_service_code: shipping.service,
      shipping_service_name: shipping.name,
      shipping_quote_expires_at: quote.expiresAt,
      shipping_cents: shipping.priceCents,
      subtotal_cents: priced.subtotalCents,
      items: priced.lines.map(l => ({
        gubo_product_code: l.productCode,
        gubo_variant_sku: l.sku,
        product_name: l.productName,
        color_name: variants.get(l.sku).color,
        size_label: variants.get(l.sku).size,
        quantity: l.quantity,
        unit_price_cents: l.unitPriceCents
      }))
    });

    // 3. Repetição da mesma chave: devolve o Pix já existente em vez de cobrar de novo.
    if (!order.created && order.status !== "draft") {
      if (order.status !== "awaiting_payment") return respond(res, 409, { error: "order_already_processed", orderReference: order.order_reference });
      stage = "existing_payment";
      const payments = await dbRequest("swc_payments", {
        params: { select: "provider_order_id", order_id: "eq." + order.order_id, order: "created_at.desc", limit: "1" }
      });
      const pix = await getOrder(payments?.[0]?.provider_order_id);
      return respond(res, 200, pixResponse(order, pix));
    }

    // 4. Cobrança Pix de teste com chave idempotente estável por pedido.
    stage = "payment";
    const [firstName, ...rest] = input.name.split(" ");
    const pix = await createPixOrder({
      idempotencyKey: "swc-pix-" + order.order_id,
      externalReference: order.order_reference,
      totalCents: order.total_cents,
      payer: { email: input.email, firstName, lastName: rest.join(" "), cpf: input.cpf }
    });
    if (!pix.providerOrderId || !pix.qrCode) return respond(res, 502, { error: "pix_unavailable" });

    stage = "record";
    await dbRpc("swc_record_payment", {
      order_id: order.order_id,
      amount_cents: order.total_cents,
      idempotency_key: "swc-pix-" + order.order_id,
      provider_order_id: pix.providerOrderId,
      provider_payment_id: pix.providerPaymentId,
      expires_at: pix.expiresAt || new Date(Date.now() + 30 * 60000).toISOString()
    });
    return respond(res, 201, pixResponse(order, pix));
  } catch (error) {
    // Sem dados pessoais nos logs: só etapa e códigos curtos.
    console.error("checkout_test_failed", stage, error?.message, error?.status || null, error?.code || null);
    if (error?.name === "AbortError") return respond(res, 504, { error: "upstream_timeout", phase: stage });
    return respond(res, 502, { error: "checkout_failed", phase: stage, code: error?.code || null });
  }
};
