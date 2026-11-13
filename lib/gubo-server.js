// Acesso server-side à API da Gubo (catálogo de variantes e cotação de frete).
// Exclusivo do backend: nunca importar no navegador. Não cria pedidos de produção.
"use strict";

const BASE = "https://api.gubo.com.br/v1";

async function guboRequest(path, key, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  try {
    const response = await fetch(BASE + path, {
      method: options.method || "GET",
      headers: {
        Authorization: "Bearer " + key,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.prefer ? { Prefer: options.prefer } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
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

// Mapa SKU → { product, color, size } apenas de variantes disponíveis.
async function availableVariants(key) {
  const out = new Map(), seen = new Set();
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ disponivel: "true", limite: "100" });
    if (cursor) params.set("cursor", cursor);
    const r = await guboRequest("/catalogo/variantes?" + params.toString(), key);
    if (r.status !== 200 || !Array.isArray(r.data?.dados)) throw new Error("catalog_unavailable");
    for (const item of r.data.dados) {
      if (item?.disponivel === true && item?.sku && item?.produto) {
        out.set(String(item.sku), {
          product: String(item.produto),
          color: item.cor?.nome ? String(item.cor.nome).slice(0, 60) : null,
          size: item.tamanho ? String(item.tamanho).slice(0, 20) : null
        });
      }
    }
    if (!r.data.tem_mais) return out;
    cursor = r.data.proximo_cursor;
    if (!cursor || seen.has(cursor)) throw new Error("invalid_pagination");
    seen.add(cursor);
  }
  throw new Error("pagination_limit");
}

// Cota o frete e devolve { state: "ready"|"pending"|"failed", options, expiresAt, selection, simulated, reason }.
async function quoteShipping(key, cep, entries) {
  const first = await guboRequest("/fretes/cotacoes", key, {
    method: "POST",
    body: { cep, itens: entries, entrega: { preferencia: "mais_barata" } }
  });
  if (first.status !== 201 && first.status !== 202) {
    const err = first.data?.erro?.codigo;
    return { state: "failed", reason: typeof err === "string" ? err.slice(0, 65) : null };
  }
  let quote = first.data;
  if (quote?.situacao === "pendente" && typeof quote?.id === "string") {
    const poll = await guboRequest("/fretes/cotacoes/" + encodeURIComponent(quote.id), key, { prefer: "wait=8" });
    if (poll.status === 200) quote = poll.data;
  }
  if (quote?.situacao === "pendente") return { state: "pending" };
  if (quote?.situacao !== "pronta" || !Array.isArray(quote.opcoes)) return { state: "failed", reason: "quote_not_ready" };
  const options = quote.opcoes
    .filter(o => typeof o?.servico === "string" && Number.isSafeInteger(o?.preco_centavos) && o.preco_centavos >= 0)
    .map(o => ({
      service: o.servico,
      name: String(o.nome || o.transportadora || "Frete").slice(0, 100),
      carrier: String(o.transportadora || "").slice(0, 70),
      priceCents: o.preco_centavos,
      businessDays: Number.isSafeInteger(o.prazo_total_dias_uteis) ? o.prazo_total_dias_uteis : null,
      estimatedDelivery: typeof o.previsao_entrega === "string" ? o.previsao_entrega : null
    }));
  return {
    state: "ready",
    options,
    expiresAt: typeof quote.valida_ate === "string" ? quote.valida_ate : null,
    selection: quote.escolha?.servico || null,
    simulated: Boolean(quote.simulada)
  };
}

module.exports = { guboRequest, availableVariants, quoteShipping };
