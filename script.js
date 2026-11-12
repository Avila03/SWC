(() => {
  "use strict";
  const cart = [];
  const panel = document.querySelector("#bag-panel");
  const overlay = document.querySelector("#bag-overlay");
  const counter = document.querySelector("#bag-count");
  const items = document.querySelector("#bag-items");
  const toast = document.querySelector("#toast");
  const open = document.querySelector("#open-bag");
  const close = document.querySelector("#close-bag");
  let lastFocus = null;
  let toastTimer;
  function render() {
    counter.textContent = String(cart.length);
    items.replaceChildren();
    if (!cart.length) {
      const empty = document.createElement("p"); empty.className = "empty-bag"; empty.innerHTML = "Sua sacola está vazia.<br><small>Explore os conceitos da coleção.</small>"; items.append(empty); return;
    }
    cart.forEach((entry,index) => {
      const name = typeof entry === "string" ? entry : entry.name;
      const line = document.createElement("div"); line.className = "bag-item";
      const info = document.createElement("div"); const heading = document.createElement("strong"); heading.textContent = name;
      const sub = document.createElement("p"); sub.textContent = typeof entry === "string" ? "Conceito demonstrativo" : entry.detail + " · " + brl(entry.priceCents); info.append(heading,sub);
      const remove = document.createElement("button"); remove.type="button"; remove.textContent="Remover"; remove.setAttribute("aria-label","Remover "+name);
      remove.addEventListener("click",() => {cart.splice(index,1);render();}); line.append(info,remove);items.append(line);
    });
  }
  function showBag(){lastFocus=document.activeElement;overlay.hidden=false;panel.classList.add("open");panel.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";close.focus();}
  function hideBag(){panel.classList.remove("open");panel.setAttribute("aria-hidden","true");overlay.hidden=true;document.body.style.overflow="";if(lastFocus && lastFocus.focus)lastFocus.focus();}
  function notify(message){toast.textContent=message;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),2300);}
  open.addEventListener("click",showBag);close.addEventListener("click",hideBag);overlay.addEventListener("click",hideBag);
  document.querySelector("#keep-exploring").addEventListener("click",hideBag);
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&panel.classList.contains("open"))hideBag();if(event.key==="Tab"&&panel.classList.contains("open")){const focusable=[...panel.querySelectorAll('button:not([disabled]),a[href]')];const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  document.querySelectorAll(".add-btn").forEach(button=>button.addEventListener("click",()=>{cart.push(button.dataset.item);render();notify(button.dataset.item+" adicionado à sacola (simulação)");}));

  // Catálogo comercial da loja (sem chave Gubo no cliente).
  const brl = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  function textEl(tag, cls, content) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    element.textContent = content || "";
    return element;
  }
  function productCard(product, index) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (!variants.length) return null;

    const card = textEl("article", "product-card");
    const visual = textEl("div", "product-visual visual-tee");
    visual.append(textEl("span", "product-label", "SWC / COLEÇÃO"));
    const photo = product.images && product.images[0];
    if (photo) {
      const image = document.createElement("img");
      image.className = "product-photo";
      image.src = photo;
      image.alt = "Foto do produto " + product.name;
      image.loading = "lazy";
      image.decoding = "async";
      visual.append(image);
    } else {
      visual.append(textEl("p", "product-no-photo", "Imagem em breve"));
    }
    visual.append(textEl("span", "product-ghost", String(index + 1).padStart(2, "0")));
    const info = textEl("div", "product-info");
    const details = textEl("div", "product-details");
    details.append(textEl("span", "", String(product.category || "SWC").toUpperCase()));
    details.append(textEl("h3", "", product.name));
    details.append(textEl("p", "", brl(product.priceCents)));
    if (product.description) details.append(textEl("p", "product-description", product.description));
    const controls = textEl("div", "product-controls");
    const label = textEl("label", "product-variant-label", "Escolha a variante");
    const select = textEl("select", "product-variant");
    select.setAttribute("aria-label", "Cor e tamanho de " + product.name);
    variants.forEach(variant => {
      const option = document.createElement("option");
      option.value = variant.sku;
      option.textContent = [variant.color, variant.size].filter(Boolean).join(" / ") || variant.sku;
      select.append(option);
    });
    label.append(select);
    const add = textEl("button", "add-btn", "Adicionar à sacola +");
    add.type = "button";
    add.addEventListener("click", () => {
      const variant = variants.find(v => v.sku === select.value);
      if (!variant) return;
      const detail = [variant.color, variant.size].filter(Boolean).join(" / ") || variant.sku;
      cart.push({ name: product.name, sku: variant.sku, detail, priceCents: product.priceCents });
      render();
      notify(product.name + " adicionado à sacola (simulação)");
    });
    controls.append(label, add);
    info.append(details, controls);
    card.append(visual, info);
    return card;
  }
  async function loadCatalog() {
    const grid = document.querySelector(".products");
    if (!grid) return;
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.products) || !payload.products.length) return;
    const cards = payload.products.map(productCard).filter(Boolean);
    if (!cards.length) return;
    grid.replaceChildren(...cards);
    const intro = document.querySelector(".section-top > p");
    if (intro) intro.textContent = "Conheça a coleção SWC. Escolha sua cor e tamanho; a sacola permanece demonstrativa enquanto preparamos o checkout.";
    const note = document.querySelector(".collection-note");
    if (note) note.textContent = "* Os preços são definidos pela SWC. Nenhuma compra é processada nesta versão.";
  }
  loadCatalog().catch(() => { /* Mantém a prévia se o catálogo estiver indisponível. */ });

  render();
})();