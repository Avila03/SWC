// SWC — Página inicial: vitrine das coleções em abas. A compra acontece na página de cada peça.
(() => {
  "use strict";
  const S = window.SWC;
  const $ = s => document.querySelector(s);

  function card(product, index, collectionName) {
    const href = "/produto.html?p=" + encodeURIComponent(product.id);
    const colors = S.colorsOf(product);
    const sizes = [...new Set(product.variants.map(v => v.size).filter(Boolean))].sort((a, b) => S.rank(a) - S.rank(b));
    const number = "Nº " + String(index + 1).padStart(2, "0");

    const el = S.el("article", "product-card");
    el.dataset.collection = product.collection || "";

    const visual = S.el("a", "product-visual visual-tee");
    visual.href = href;
    visual.setAttribute("aria-label", "Ver a peça " + product.name);
    visual.append(S.el("span", "product-label", number));
    const back = S.photo(product, colors[0], "back"), front = S.photo(product, colors[0], "front");
    const noPhoto = () => {
      visual.querySelectorAll(".product-stage,.product-reflex,.product-flip-hint").forEach(n => n.remove());
      visual.classList.remove("has-back"); visual.classList.add("no-photo");
      if (!visual.querySelector(".product-no-photo")) visual.append(S.el("p", "product-no-photo", "Imagem em breve"));
    };
    if (back) {
      const stage = S.el("div", "product-stage");
      const img = S.el("img", "product-photo"); img.src = back; img.alt = product.name + (colors[0] ? ", " + colors[0] : ""); img.loading = "lazy"; img.decoding = "async";
      img.addEventListener("error", noPhoto);
      stage.append(img);
      if (front && front !== back) {
        const f = S.el("img", "product-photo product-photo-back"); f.src = front; f.alt = ""; f.loading = "lazy"; f.decoding = "async";
        f.addEventListener("error", () => { f.remove(); visual.classList.remove("has-back"); });
        stage.append(f); visual.classList.add("has-back");
      }
      const reflex = S.el("img", "product-reflex"); reflex.src = back; reflex.alt = ""; reflex.loading = "lazy"; reflex.setAttribute("aria-hidden", "true");
      reflex.addEventListener("error", () => reflex.remove());
      visual.append(stage, reflex);
    } else noPhoto();

    const info = S.el("div", "product-info");
    const details = S.el("div", "product-details");
    details.append(S.el("span", "product-number", number + " · " + String(collectionName || "SWC").toUpperCase()));
    const title = S.el("a", "card-link"); title.href = href; title.append(S.el("h3", "", product.name));
    details.append(title);
    const sheet = S.el("dl", "product-sheet");
    const row = (t, v) => sheet.append(S.el("dt", "", t), S.el("dd", "", v));
    row("Peça", product.category || "SWC");
    if (sizes.length) row("Tamanhos", sizes.join(" · "));
    row("Valor", S.money(product.priceCents));
    details.append(sheet, S.el("p", "product-price", S.money(product.priceCents)));

    const cta = S.el("div", "card-cta");
    const dots = S.el("span", "card-dots");
    if (colors.length) { dots.setAttribute("role", "img"); dots.setAttribute("aria-label", "Cores: " + colors.join(", ")); }
    colors.slice(0, 6).forEach(c => { const i = S.el("i"); i.style.setProperty("--sw", S.colorHex(c)); i.title = c; dots.append(i); });
    const go = S.el("a", "g-link", product.variants.length ? "Ver peça →" : "Em breve");
    go.href = href; go.setAttribute("aria-hidden", "true"); go.tabIndex = -1;
    cta.append(dots, go);
    info.append(details, cta);
    el.append(visual, info);
    return el;
  }

  function render(products, collections) {
    const grid = $(".products"), tabs = $(".g-tabs"), soon = $(".g-soon");
    const valid = collections.filter(c => c && typeof c.id === "string" && typeof c.name === "string");
    const groups = valid.length ? valid : [{ id: "", name: "Coleção", status: "open" }];
    const cards = [];
    for (const g of groups) products.filter(p => valid.length ? p.collection === g.id : true).forEach((p, i) => cards.push(card(p, i, g.name)));
    grid.replaceChildren(...cards);
    if (groups.length < 2) return;

    const select = (id, focus) => {
      const group = groups.find(g => g.id === id) || groups[0];
      tabs.querySelectorAll("[role=tab]").forEach(tab => {
        const on = tab.dataset.id === group.id;
        tab.setAttribute("aria-selected", String(on)); tab.tabIndex = on ? 0 : -1;
        if (on && focus) tab.focus();
      });
      let shown = 0;
      grid.querySelectorAll(".product-card").forEach(c => { const on = c.dataset.collection === group.id; c.hidden = !on; if (on) shown += 1; });
      grid.hidden = shown === 0;
      soon.hidden = shown > 0;
      soon.textContent = group.status === "soon" ? group.name + " em preparação. O próximo drop está chegando." : "Nenhuma peça disponível nesta coleção agora.";
      try { history.replaceState(null, "", "#colecao" + (group.id ? "=" + group.id : "")); } catch (_) { /* sem histórico */ }
    };
    tabs.replaceChildren(...groups.map(g => {
      const tab = S.el("button", "g-tab", g.name); tab.type = "button"; tab.setAttribute("role", "tab"); tab.dataset.id = g.id;
      if (g.status === "soon") tab.append(S.el("small", "", "Em breve"));
      tab.addEventListener("click", () => select(g.id));
      tab.addEventListener("keydown", e => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = groups.indexOf(g); select(groups[(i + (e.key === "ArrowRight" ? 1 : groups.length - 1)) % groups.length].id, true);
      });
      return tab;
    }));
    tabs.hidden = false;
    // Link direto para uma coleção: /#colecao=especimes
    const wanted = (location.hash.match(/^#colecao=(.+)$/) || [])[1];
    const first = groups.find(g => g.id === wanted) || groups.find(g => products.some(p => p.collection === g.id)) || groups[0];
    const hadHash = location.hash;
    select(first.id);
    if (!hadHash) { try { history.replaceState(null, "", location.pathname + location.search); } catch (_) { /* ok */ } }
    else if (wanted) $("#colecao").scrollIntoView();
  }

  async function init() {
    const grid = $(".products");
    try {
      const data = await S.fetchCatalog();
      if (!data.products.length) throw new Error("empty");
      render(data.products, data.collections);
    } catch (_) {
      const retry = S.el("button", "p-btn p-btn-ghost", "Tentar de novo"); retry.type = "button";
      retry.addEventListener("click", () => location.reload());
      grid.replaceChildren(S.el("p", "catalog-loading", "Não foi possível carregar a coleção agora."), retry);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
