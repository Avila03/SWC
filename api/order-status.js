// SWC — Estado de um pedido para a tela de pagamento.
// Exige o número do pedido E a chave de idempotência do checkout (um UUID que só o navegador
// de quem criou o pedido conhece). Devolve apenas o estado; nenhum dado pessoal.
"use strict";
const { dbRequest, isConfigured } = require("../lib/supabase-server");
const usage = new Map();

function limited(req) {
  const id = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "unknown").split(",")[0].slice(0, 90);
  const now = Date.now();
  const list = (usage.get(id) || []).filter(t => now - t < 60000);
  list.push(now); usage.set(id, list);
  if (usage.size > 250) for (const [k, v] of usage) if (!v.length || now - v[v.length - 1] > 60000) usage.delete(k);
  return list.length > 30;
}
const PUBLIC = {
  draft: "awaiting_payment", awaiting_payment: "awaiting_payment",
  paid: "paid", production_pending: "paid", in_production: "paid", shipped: "paid", delivered: "paid",
  cancelled: "cancelled", failed: "cancelled", refunded: "cancelled"
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method_not_allowed" }); }
  if (!isConfigured()) return res.status(503).json({ error: "not_configured" });
  if (limited(req)) return res.status(429).json({ error: "too_many_requests" });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const reference = typeof body.orderReference === "string" && /^SWC-\d{6}-[A-Z0-9]{6}$/.test(body.orderReference) ? body.orderReference : null;
  const key = typeof body.key === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.key) ? body.key.toLowerCase() : null;
  if (!reference || !key) return res.status(422).json({ error: "invalid_request" });
  try {
    const rows = await dbRequest("swc_orders", {
      params: { select: "status", order_reference: "eq." + reference, checkout_idempotency_key: "eq." + key, limit: "1" }
    });
    const status = rows?.[0]?.status;
    if (!status) return res.status(404).json({ error: "not_found" });
    return res.status(200).json({ status: PUBLIC[status] || "awaiting_payment" });
  } catch (error) {
    console.error("order_status_failed", error?.status || null);
    return res.status(502).json({ error: "unavailable" });
  }
};
