// Catálogo público da SWC. Dados comerciais são mantidos pela loja;
// SKUs das variantes são usados posteriormente no vínculo com a Gubo.
// Não consulta nem expõe GUBO_API_KEY.
const catalog = require("../data/catalog.json");

function safeImage(url) {
  if (typeof url !== "string" || url.length > 2048) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const publicProducts = products.filter(p =>
    p && p.active === true &&
    typeof p.id === "string" && p.id.length <= 120 &&
    typeof p.name === "string" && p.name.length <= 180 &&
    Number.isSafeInteger(p.priceCents) && p.priceCents > 0 &&
    Array.isArray(p.variants) && p.variants.some(v => v && v.available !== false && typeof v.sku === "string" && v.sku.length > 0)
  ).map(p => ({
    id: p.id, name: p.name,
    category: typeof p.category === "string" ? p.category.slice(0, 80) : "SWC",
    description: typeof p.description === "string" ? p.description.slice(0, 600) : "",
    priceCents: p.priceCents,
    images: (Array.isArray(p.images) ? p.images : []).map(safeImage).filter(Boolean).slice(0, 8),
    variants: p.variants.filter(v =>
      v && v.available !== false && typeof v.sku === "string" &&
      v.sku.length > 0 && v.sku.length <= 120
    ).map(v => ({
      sku: v.sku, color: typeof v.color === "string" ? v.color.slice(0, 60) : "",
      size: typeof v.size === "string" ? v.size.slice(0, 30) : ""
    }))
  }));
  return res.status(200).json({ version: 1, products: publicProducts });
};