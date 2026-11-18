// SWC — Página da peça: galeria por cor (costas/frente), cor e tamanho em seletores separados.
(() => {
  "use strict";
  const S = window.SWC;
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const id = params.get("p");

  function notFound() {
    $("#produto").replaceChildren(S.el("p", "p-loading", "Peça não encontrada."), Object.assign(S.el("a", "g-link", "Voltar às coleções →"), { href: "/#colecao" }));
  }

  async function init() {
    let data;
    try { data = await S.fetchCatalog(); } catch (_) { $("#produto").replaceChildren(S.el("p", "p-loading", "Não foi possível carregar a peça. Atualize a página.")); return; }
    const product = data.products.find(p => p.id === id);
    if (!product) return notFound();
    const collection = data.collections.find(c => c.id === product.collection);
    const siblings = data.products.filter(p => p.collection === product.collection);
    const number = "Nº " + String(Math.max(0, siblings.indexOf(product)) + 1).padStart(2, "0");

    document.title = product.name + " — Swamp Chill";
    // Metadados da peça (busca e compartilhamento)
    const desc = product.name + " · " + (product.category || "Streetwear") + " da coleção " + (collection ? collection.name : "SWC") + ". " + S.money(product.priceCents) + ". Feita sob demanda.";
    document.querySelector('meta[name="description"]')?.setAttribute("content", desc);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", product.name + " — Swamp Chill");
    $("#crumb-collection").href = "/#colecao=" + encodeURIComponent(product.collection || "");
    const firstPhoto = S.photo(product, S.colorsOf(product)[0], "back");
    const ld = document.createElement("script"); ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "Product", name: product.name, category: product.category || undefined,
      brand: { "@type": "Brand", name: "Swamp Chill" },
      image: firstPhoto ? new URL(firstPhoto, location.origin).href : undefined,
      offers: { "@type": "Offer", priceCurrency: "BRL", price: (product.priceCents / 100).toFixed(2), url: location.href.split("&")[0] }
    });
    document.head.append(ld);
    $("#crumb-collection").textContent = collection ? collection.name : "Coleção";
    $("#crumb-name").textContent = product.name;

    const colors = S.colorsOf(product);
    const sizesAll = [...new Set(product.variants.map(v => v.size).filter(Boolean))].sort((a, b) => S.rank(a) - S.rank(b));
    const state = {
      color: params.get("cor") && colors.includes(params.get("cor")) ? params.get("cor") : colors[0],
      size: null,
      side: "back",
      qty: 1
    };

    // ----- Galeria -----
    const gallery = S.el("div", "p-gallery");
    const stage = S.el("div", "p-stage");
    const main = S.el("img", "p-main-img"); main.decoding = "async";
    const reflex = S.el("img", "p-reflex"); reflex.alt = ""; reflex.setAttribute("aria-hidden", "true");
    const empty = S.el("p", "p-empty", "Imagem em breve");
    stage.append(S.el("span", "p-num", number), main, reflex, empty);
    const thumbs = S.el("div", "p-thumbs"); thumbs.setAttribute("role", "tablist"); thumbs.setAttribute("aria-label", "Vistas da peça");
    gallery.append(stage, thumbs);

    function renderGallery() {
      const back = S.photo(product, state.color, "back"), front = S.photo(product, state.color, "front");
      const views = [["back", "Costas", back], ["front", "Frente", front], ["look", "Conjunto", product.lookbook]].filter(v => v[2]);
      const uniq = views.filter((v, i) => views.findIndex(w => w[2] === v[2]) === i);
      if (!uniq.find(v => v[0] === state.side)) state.side = uniq[0]?.[0] || "back";
      const current = uniq.find(v => v[0] === state.side);
      if (current) {
        main.hidden = reflex.hidden = false; empty.hidden = true;
        main.onerror = () => { main.hidden = reflex.hidden = true; empty.hidden = false; };
        main.src = current[2]; reflex.src = current[2];
        stage.classList.toggle("is-look", current[0] === "look");
        main.alt = current[1] + " da peça " + product.name + " na cor " + state.color;
        stage.classList.remove("swap"); void stage.offsetWidth; stage.classList.add("swap");
      } else { main.hidden = reflex.hidden = true; empty.hidden = false; }
      thumbs.replaceChildren(...uniq.map(([side, label, src]) => {
        const b = S.el("button", "p-thumb"); b.type = "button"; b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(side === state.side)); b.setAttribute("aria-label", label);
        const img = S.el("img"); img.src = src; img.alt = ""; img.loading = "lazy";
        b.append(img, S.el("span", "", label));
        b.addEventListener("click", () => { state.side = side; renderGallery(); });
        return b;
      }));
      thumbs.hidden = uniq.length < 2;
    }

    // ----- Informações e escolhas -----
    const info = S.el("div", "p-info");
    info.append(S.el("p", "p-kicker", number + " · " + (collection ? collection.name : "SWC").toUpperCase()));
    info.append(S.el("h1", "p-title", product.name));
    info.append(S.el("p", "p-price", S.money(product.priceCents)));
    info.append(S.el("p", "p-pay", "Pagamento via Pix · frete calculado no checkout"));

    const colorBlock = S.el("div", "p-choice");
    const colorHead = S.el("p", "p-choice-head"); const colorName = S.el("span");
    colorHead.append(S.el("b", "", "Cor"), colorName);
    const swatches = S.el("div", "p-swatches"); swatches.setAttribute("role", "radiogroup"); swatches.setAttribute("aria-label", "Cor");
    colorBlock.append(colorHead, swatches);

    const sizeBlock = S.el("div", "p-choice");
    const sizeHead = S.el("p", "p-choice-head"); const sizeName = S.el("span");
    sizeHead.append(S.el("b", "", "Tamanho"), sizeName);
    const sizes = S.el("div", "p-sizes"); sizes.setAttribute("role", "radiogroup"); sizes.setAttribute("aria-label", "Tamanho");
    sizeBlock.append(sizeHead, sizes);

    const buy = S.el("div", "p-buy");
    const qty = S.el("div", "p-qty");
    const minus = S.el("button", "", "−"), plus = S.el("button", "", "+"), qn = S.el("span", "", "1");
    minus.type = plus.type = "button"; minus.setAttribute("aria-label", "Diminuir quantidade"); plus.setAttribute("aria-label", "Aumentar quantidade");
    qty.append(minus, qn, plus);
    const add = S.el("button", "p-btn p-add", "Adicionar à sacola"); add.type = "button";
    const now = S.el("button", "p-btn p-btn-ghost", "Comprar agora"); now.type = "button";
    const msg = S.el("p", "p-msg"); msg.setAttribute("role", "status");
    buy.append(qty, add, now);

    const sheet = S.el("dl", "product-sheet p-sheet");
    const row = (t, v) => sheet.append(S.el("dt", "", t), S.el("dd", "", v));
    row("Peça", product.category || "SWC");
    if (product.model) row("Modelo", product.model);
    row("Cores", colors.join(", "));
    row("Tamanhos", sizesAll.join(" · "));
    row("Produção", "Sob demanda, feita pra você");

    info.append(colorBlock, sizeBlock, buy, msg, sheet);
    if (product.description) info.append(S.el("p", "p-desc", product.description));

    const variantFor = (color, size) => product.variants.find(v => v.color === color && v.size === size);

    function renderChoices() {
      colorName.textContent = state.color || "";
      swatches.replaceChildren(...colors.map(c => {
        const b = S.el("button", "p-swatch"); b.type = "button"; b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(c === state.color)); b.setAttribute("aria-label", c); b.title = c;
        b.style.setProperty("--sw", S.colorHex(c));
        b.addEventListener("click", () => {
          state.color = c;
          if (state.size && !variantFor(c, state.size)) state.size = null;
          renderChoices(); renderGallery();
        });
        return b;
      }));
      sizeName.textContent = state.size ? state.size : "Escolha um tamanho";
      sizes.replaceChildren(...sizesAll.map(z => {
        const ok = Boolean(variantFor(state.color, z));
        const b = S.el("button", "p-size", z); b.type = "button"; b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(z === state.size)); b.disabled = !ok;
        if (!ok) b.title = "Indisponível nesta cor";
        b.addEventListener("click", () => { state.size = z; msg.textContent = ""; renderChoices(); });
        return b;
      }));
      qn.textContent = String(state.qty);
    }
    minus.addEventListener("click", () => { state.qty = Math.max(1, state.qty - 1); qn.textContent = String(state.qty); });
    plus.addEventListener("click", () => { state.qty = Math.min(10, state.qty + 1); qn.textContent = String(state.qty); });

    function addCurrent() {
      const v = state.size && variantFor(state.color, state.size);
      if (!v) { msg.textContent = "Escolha o tamanho antes de continuar."; sizes.querySelector("button:not(:disabled)")?.focus(); return null; }
      if (!S.addToCart(v.sku, state.qty)) { msg.textContent = "Limite de 20 peças por pedido."; return null; }
      return v;
    }
    add.addEventListener("click", () => {
      const v = addCurrent(); if (!v) return;
      const box = $("#p-added");
      $("#p-added-img").src = S.photo(product, state.color, "back") || "";
      $("#p-added-name").textContent = product.name;
      $("#p-added-variant").textContent = state.color + " · " + state.size + " · " + state.qty + (state.qty > 1 ? " peças" : " peça");
      box.hidden = false; box.classList.remove("show"); void box.offsetWidth; box.classList.add("show");
      $("#p-added-close").focus();
    });
    now.addEventListener("click", () => { if (addCurrent()) location.href = "/checkout.html"; });
    $("#p-added-close").addEventListener("click", () => { $("#p-added").hidden = true; add.focus(); });

    $("#produto").replaceChildren(gallery, info);
    renderChoices(); renderGallery();
    const comingSoon = !product.variants.length;
    if (comingSoon) {
      sizeBlock.hidden = true; buy.hidden = true;
      sheet.querySelectorAll("dt").forEach(dt => { if (dt.textContent === "Tamanhos") { dt.nextElementSibling.remove(); dt.remove(); } });
      const soonNote = S.el("p", "p-soon", "Em breve na loja. A peça já está pronta e entra à venda no próximo lançamento.");
      buy.after(soonNote);
    }

    // Barra de compra fixa no celular: aparece quando o botão principal sai da tela.
    const bar = S.el("div", "p-sticky"); bar.hidden = true;
    if (comingSoon) bar.classList.add("is-off");
    const barText = S.el("div"); barText.append(S.el("strong", "", product.name), S.el("span", "", S.money(product.priceCents)));
    const barBtn = S.el("button", "p-btn", "Adicionar"); barBtn.type = "button";
    barBtn.addEventListener("click", () => {
      if (!state.size) { sizeBlock.scrollIntoView({ behavior: "smooth", block: "center" }); msg.textContent = "Escolha o tamanho antes de continuar."; return; }
      add.click();
    });
    bar.append(barText, barBtn); document.body.append(bar);
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { bar.hidden = e.isIntersecting; }).observe(buy);

    // Setas do teclado nos grupos de cor e tamanho
    [swatches, sizes].forEach(group => group.addEventListener("keydown", e => {
      if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
      const items = [...group.querySelectorAll("button:not(:disabled)")]; const i = items.indexOf(document.activeElement);
      if (i < 0) return; e.preventDefault();
      const next = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
      const label = next.getAttribute("aria-label") || next.textContent; next.click();
      [...group.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") || b.textContent) === label)?.focus();
    }));

    // ----- Outras peças da coleção -----
    const others = siblings.filter(p => p.id !== product.id);
    if (others.length) {
      $("#mais-grid").replaceChildren(...others.map(p => {
        const a = S.el("a", "p-more-card"); a.href = "/produto.html?p=" + encodeURIComponent(p.id);
        const fig = S.el("div", "p-more-img");
        const src = S.photo(p, S.colorsOf(p)[0], "back");
        if (src) { const img = S.el("img"); img.src = src; img.alt = ""; img.loading = "lazy"; img.onerror = () => { img.remove(); fig.append(S.el("span", "", "Imagem em breve")); }; fig.append(img); }
        else fig.append(S.el("span", "", "Imagem em breve"));
        a.append(fig, S.el("strong", "", p.name), S.el("span", "", S.money(p.priceCents)));
        return a;
      }));
      $("#mais").hidden = false;
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
