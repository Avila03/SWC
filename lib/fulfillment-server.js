// Envio do pedido PAGO para produção na Gubo (somente chave de TESTE nesta etapa).
// Idempotente: referência estável (order_reference) + Idempotency-Key fixa por pedido.
// Não paga a produção na Gubo: esse passo mexe no saldo da conta e é decidido à parte.
"use strict";

const { guboRequest } = require("./gubo-server");
const { dbRequest } = require("./supabase-server");

const MAP = {
  aguardando_pagamento: "awaiting_production_payment",
  pendente: "submitted",
  recusado: "failed",
  cancelado: "cancelled"
};

function enabled() {
  const key = process.env.GUBO_ORDERS_API_KEY;
  return process.env.SWC_GUBO_AUTO_SUBMIT === "enabled" && typeof key === "string" && key.startsWith("gubo_test_");
}

async function logEvent(orderId, type, data) {
  await dbRequest("swc_order_events", {
    method: "POST", prefer: "return=minimal",
    data: { order_id: orderId, source: "gubo", event_type: type, event_data: data }
  });
}

async function submitPaidOrder(orderId) {
  if (!enabled()) return { result: "disabled" };
  const rows = await dbRequest("swc_orders", {
    params: { select: "id,order_reference,status,environment,customer_name,customer_email,customer_phone,customer_document,shipping_address,shipping_postal_code,shipping_service_code,swc_order_items(gubo_variant_sku,quantity)", id: "eq." + orderId, limit: "1" }
  });
  const order = rows?.[0];
  if (!order || order.status !== "paid") return { result: "not_paid" };

  const idempotencyKey = "swc-gubo-" + order.id;
  await dbRequest("swc_fulfillments", {
    method: "POST", params: { on_conflict: "order_id" }, prefer: "resolution=ignore-duplicates,return=minimal",
    data: { order_id: order.id, environment: order.environment, status: "pending", gubo_reference: order.order_reference, idempotency_key: idempotencyKey }
  });
  const existing = (await dbRequest("swc_fulfillments", {
    params: { select: "id,status,gubo_order_id", order_id: "eq." + order.id, limit: "1" }
  }))?.[0];
  if (existing?.gubo_order_id) return { result: "already_submitted" };

  const a = order.shipping_address || {};
  const body = {
    referencia: order.order_reference,
    itens: (order.swc_order_items || []).map(i => ({ sku: i.gubo_variant_sku, quantidade: i.quantity })),
    destinatario: {
      nome: order.customer_name,
      documento: order.customer_document,
      email: order.customer_email || undefined,
      telefone: order.customer_phone || undefined,
      endereco: {
        cep: order.shipping_postal_code,
        logradouro: a.street, numero: a.number,
        complemento: a.complement ? String(a.complement).slice(0, 60) : undefined,
        bairro: a.district, cidade: a.city, uf: a.state
      }
    },
    entrega: order.shipping_service_code
      ? { servico: order.shipping_service_code, se_indisponivel: "pendencia" }
      : { preferencia: "mais_barata" },
    metadados: { swc_order_id: order.id }
  };
  const r = await guboRequest("/pedidos/por-variante", process.env.GUBO_ORDERS_API_KEY, {
    method: "POST", body, idempotencyKey, prefer: "wait=8", timeoutMs: 14000
  });

  if (r.status !== 201 && r.status !== 200 && r.status !== 202) {
    const code = typeof r.data?.erro?.codigo === "string" ? r.data.erro.codigo.slice(0, 60) : "http_" + r.status;
    await dbRequest("swc_fulfillments", {
      method: "PATCH", params: { order_id: "eq." + order.id }, prefer: "return=minimal",
      data: { status: r.status >= 500 || r.status === 429 ? "pending" : "failed", last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    });
    await logEvent(order.id, "gubo_submit_failed", { code, http: r.status });
    const error = new Error("gubo_submit_failed"); error.code = code; error.status = r.status;
    throw error;
  }

  const p = r.data || {};
  const status = MAP[p.situacao] || "submitted";
  await dbRequest("swc_fulfillments", {
    method: "PATCH", params: { order_id: "eq." + order.id }, prefer: "return=minimal",
    data: { status, gubo_order_id: typeof p.id === "string" ? p.id : String(p.id || ""), last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  });
  if (status !== "failed" && status !== "cancelled") {
    await dbRequest("swc_orders", {
      method: "PATCH", params: { id: "eq." + order.id, status: "eq.paid" }, prefer: "return=minimal",
      data: { status: "production_pending", updated_at: new Date().toISOString() }
    });
  }
  await logEvent(order.id, "gubo_submitted", {
    gubo_order_id: p.id || null, situacao: p.situacao || null,
    pendencias: Array.isArray(p.pendencias) ? p.pendencias.length : 0,
    total_centavos: p.valores?.total_centavos ?? null
  });
  return { result: "submitted", status };
}

module.exports = { submitPaidOrder, enabled };
