// Catálogo SWC: dados de venda próprios + produtos e variantes diretamente da API Gubo.
// A GUBO_API_KEY é usada apenas no servidor e nunca enviada ao navegador.
const catalog = require("../data/catalog.json");
const GUBO_BASE = "https://api.gubo.com.br/v1";

function normalize(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function safeImage(url) {
  if (typeof url !== "string" || url.length > 2048) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch { return null; }
}
async function readCatalogPage(path, key, cursor) {
  const url = new URL(GUBO_BASE + path);
  url.searchParams.set("limite", "100");
  if (path === "/catalogo/variantes") url.searchParams.set("disponivel", "true");
  if (cursor) url.searchParams.set("cursor", cursor);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + key,
        Accept: "application/json"
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error("gubo_status_" + response.status);
    const result = await response.json();
    if (!result || !Array.isArray(result.dados)) throw new Error("gubo_invalid_response");
    return result;
  } finally { clearTimeout(timer); }
}
async function readAll(path, key) {
  const all = [], seen = new Set();
  let cursor = null;
  for (let page=0;page<10;page++) {
    const result = await readCatalogPage(path,key,cursor);
    all.push(...result.dados);
    if (!result.tem_mais) return all;
    if (!result.proximo_cursor || seen.has(result.proximo_cursor)) {
      throw new Error("gubo_pagination_invalid");
    }
    cursor = result.proximo_cursor; seen.add(cursor);
  }
  throw new Error("gubo_page_limit");
}
// Reúne todas as URLs de imagem que a Gubo devolve para o produto (capa, mockups, galerias),
// para o navegador tentar em ordem caso a primeira não carregue.
function guboImages(product) {
  const found = [];
  const visit = (value, key, depth) => {
    if (depth > 3 || found.length >= 12 || value == null) return;
    if (typeof value === "string") {
      const looksImage = /imag|mockup|foto|photo|thumb|capa|preview|arte/i.test(key) ||
        /\.(png|jpe?g|webp|avif)(\?|$)/i.test(value);
      const fixed = value.startsWith("//") ? "https:" + value : value;
      const safe = looksImage ? safeImage(fixed) : null;
      if (safe && !found.includes(safe)) found.push(safe);
      return;
    }
    if (Array.isArray(value)) { for (const item of value) visit(item, key, depth + 1); return; }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, key + "." + k, depth + 1);
    }
  };
  visit(product, "", 0);
  // A URL principal vem por último entre as da Gubo: hoje ela pode apontar para uma página 404.
  const primary = safeImage(product?.imagem_url);
  return primary ? [...found.filter(u => u !== primary), primary] : found;
}
function collections() {
  return (Array.isArray(catalog.collections)?catalog.collections:[])
    .filter(c=>c&&typeof c.id==="string"&&typeof c.name==="string")
    .map(c=>({id:c.id,name:c.name,status:c.status==="soon"?"soon":"open"}));
}
function localProduct(p) {
  return {
    id:p.id,name:p.name,category:p.category||"SWC",
    description:p.description||"",priceCents:p.priceCents,
    images:(p.images||[]).map(safeImage).filter(Boolean).slice(0,8),
    variants:[],variantStatus:"pending",
    collection:typeof p.collection==="string"?p.collection:null,
    source:"swc"
  };
}
module.exports = async function handler(req,res) {
  res.setHeader("X-Content-Type-Options","nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"method_not_allowed"});
  }
  const configured = (Array.isArray(catalog.products)?catalog.products:[]).filter(p=>
    p && p.active === true && typeof p.id === "string" && typeof p.name === "string" &&
    Number.isSafeInteger(p.priceCents) && p.priceCents > 0
  );
  const key = process.env.GUBO_API_KEY;
  if (!key || !/^gubo_(test|live)_/.test(key)) {
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({version:2,source:"unavailable",checkoutEnabled:false,collections:collections(),products:configured.map(localProduct)});
  }
  try {
    const [guboProducts,guboVariants] = await Promise.all([
      readAll("/catalogo/produtos",key),
      readAll("/catalogo/variantes",key)
    ]);
    const byCode = new Map(guboProducts.filter(p=>p?.codigo).map(p=>[String(p.codigo),p]));
    const byName = new Map(guboProducts.filter(p=>p?.nome).map(p=>[normalize(p.nome),p]));
    const variantsByCode = new Map();
    for (const variant of guboVariants) {
      if (!variant || variant.disponivel !== true || !variant.produto || !variant.sku) continue;
      const code = String(variant.produto);
      if (!variantsByCode.has(code)) variantsByCode.set(code,[]);
      variantsByCode.get(code).push({
        sku:String(variant.sku),
        color:String(variant.cor?.nome||""),
        colorCode:String(variant.cor?.codigo||""),
        size:String(variant.tamanho||"")
      });
    }
    const products = configured.map(p=>{
      // A loja mantém nome e preço. A Gubo fornece imagens e variantes de produção.
      const match = (p.guboProductCode && byCode.get(String(p.guboProductCode))) || byName.get(normalize(p.name));
      const variants = match ? (variantsByCode.get(String(match.codigo))||[]) : [];
      const own = (p.images||[]).map(safeImage).filter(Boolean);
      const remote = match ? guboImages(match) : [];
      return {
        ...localProduct(p),
        // Fotos próprias da SWC têm prioridade; depois as da Gubo.
        images:[...own,...remote.filter(u=>!own.includes(u))].slice(0,8),
        variants,
        variantStatus:variants.length?"mapped":"pending",
        source:match?"gubo":"swc",
        guboProductCode:match?.codigo||null,
        model:match?.modelo?.nome||null
      };
    });
    res.setHeader("Cache-Control","public, max-age=0, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      version:2,source:"gubo",mode:key.startsWith("gubo_test_")?"test":"production",
      checkoutEnabled:false,collections:collections(),products
    });
  } catch(error) {
    // Falha fechada: sem catálogo da Gubo, não habilitar compras.
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({
      version:2,source:"unavailable",checkoutEnabled:false,collections:collections(),products:configured.map(localProduct)
    });
  }
};