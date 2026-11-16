// SWC — utilidades compartilhadas pelas páginas de peça e de checkout.
// A sacola usa a mesma chave da página inicial (swc.cart.v1): [{ sku, quantity }].
(() => {
  "use strict";
  const CART_KEY = "swc.cart.v1";
  const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "XG", "XGG", "EG", "EGG"];
  const COLOR_HEX = {
    "preto": "#111111", "branco": "#F2F0EC", "offwhite": "#ECE5D6", "off-white": "#ECE5D6",
    "verde musgo": "#3F4A2A", "cinza": "#8E8E8E", "marrom": "#5B4030"
  };
  let catalogPromise = null;

  const SWC = {
    money: cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100),
    el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null) node.textContent = String(text);
      return node;
    },
    rank: size => { const i = SIZE_ORDER.indexOf(String(size || "").toUpperCase()); return i < 0 ? 99 : i; },
    colorHex: name => COLOR_HEX[String(name || "").toLowerCase()] || "#777",

    readCart() {
      try {
        const v = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
        return Array.isArray(v) ? v.filter(i => typeof i?.sku === "string" && Number.isInteger(i?.quantity) && i.quantity > 0)
          .map(i => ({ sku: i.sku, quantity: Math.min(i.quantity, 10) })) : [];
      } catch (_) { return []; }
    },
    writeCart(cart) {
      try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) { /* armazenamento indisponível */ }
      SWC.updateBagCount();
    },
    addToCart(sku, quantity) {
      const cart = SWC.readCart();
      const line = cart.find(i => i.sku === sku);
      const total = cart.reduce((s, i) => s + i.quantity, 0);
      if (total + quantity > 20) return false;
      if (line) line.quantity = Math.min(10, line.quantity + quantity);
      else cart.push({ sku, quantity });
      SWC.writeCart(cart);
      return true;
    },
    updateBagCount() {
      const n = SWC.readCart().reduce((s, i) => s + i.quantity, 0);
      document.querySelectorAll("[data-bag-count]").forEach(el => { el.textContent = String(n); });
    },

    fetchCatalog() {
      if (!catalogPromise) {
        catalogPromise = fetch("/api/catalog", { cache: "no-store" })
          .then(r => { if (!r.ok) throw new Error("catalog_http"); return r.json(); })
          .then(data => ({
            collections: Array.isArray(data.collections) ? data.collections : [],
            products: (data.products || []).filter(p => p && typeof p.id === "string" && Number.isSafeInteger(p.priceCents) && Array.isArray(p.variants))
          }));
      }
      return catalogPromise;
    },
    findBySku(products, sku) {
      for (const product of products) {
        const variant = (product.variants || []).find(v => v.sku === sku);
        if (variant) return { product, variant };
      }
      return null;
    },
    // Foto da peça numa cor: costas (arte) ou frente. Cai para a lista geral se não houver foto por cor.
    photo(product, color, side) {
      const map = product.imagesByColor;
      const set = map && (map[color] || map[product.defaultColor] || Object.values(map)[0]);
      if (set) return set[side] || set.back || set.front || null;
      return (product.images || [])[side === "front" ? 1 : 0] || (product.images || [])[0] || null;
    },
    colorsOf(product) {
      const colors = [...new Set((product.variants || []).map(v => v.color).filter(Boolean))];
      const d = product.defaultColor;
      return d && colors.includes(d) ? [d, ...colors.filter(c => c !== d)] : colors;
    }
  };
  window.SWC = SWC;
  document.addEventListener("DOMContentLoaded", SWC.updateBagCount);
})();
