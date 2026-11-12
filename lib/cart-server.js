// Validação da sacola no servidor: SKUs, quantidades e preços vêm do catálogo da SWC,
// nunca do navegador.
"use strict";

const { products } = require("../data/catalog.json");

function activeProducts() {
  return (products || []).filter(p =>
    p?.active === true && p?.guboProductCode && Number.isSafeInteger(p.priceCents) && p.priceCents > 0);
}

// Devolve { error } ou { lines, subtotalCents, quantity }.
function priceItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 8) return { error: "invalid_items" };
  const catalog = activeProducts();
  const seen = new Set();
  const lines = [];
  let quantity = 0, subtotalCents = 0;
  for (const item of items) {
    const sku = item?.sku;
    const qty = item?.quantity;
    if (typeof sku !== "string" || !/^[A-Za-z0-9._\/-]{1,90}$/.test(sku) ||
        !Number.isInteger(qty) || qty < 1 || qty > 10 || seen.has(sku)) {
      return { error: "invalid_items" };
    }
    seen.add(sku);
    quantity += qty;
    if (quantity > 20) return { error: "too_many_items" };
    const product = catalog.find(p => sku.startsWith(String(p.guboProductCode) + "-"));
    if (!product) return { error: "unknown_product" };
    subtotalCents += product.priceCents * qty;
    lines.push({
      sku, quantity: qty,
      productCode: String(product.guboProductCode),
      productName: String(product.name).slice(0, 120),
      unitPriceCents: product.priceCents
    });
  }
  return { lines, subtotalCents, quantity };
}

module.exports = { priceItems };
