(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const els = {
    panel: $("#bag-panel"), overlay: $("#bag-overlay"), counter: $("#bag-count"),
    items: $("#bag-items"), toast: $("#toast"), shipping: $("#bag-shipping"),
    shippingForm: $("#shipping-form"), shippingInput: $("#shipping-cep"),
    shippingMessage: $("#shipping-message"), shippingOptions: $("#shipping-options"),
    quoteButton: $("#quote-button"), subtotal: $("#bag-subtotal"),
    shippingValue: $("#bag-shipping-value"), grandTotal: $("#bag-grand-total")
  };
  const STORAGE = "swc.cart.v1";
  const money = cents => new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL"
  }).format(cents / 100);

  let catalog = [];
  let cart = [];
  let quote = null;
  let selectedService = null;
  let lastFocus = null;
  let toastTimer = null;
  let quoteVersion = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function getProduct(sku) {
    for (const product of catalog) {
      if ((product.variants || []).some(variant => variant.sku === sku)) return product;
    }
    return null;
  }
  function getVariant(sku) {
    const product = getProduct(sku);
    if (!product) return null;
    return (product.variants || []).find(variant => variant.sku === sku) || null;
  }
  function countItems() { return cart.reduce((sum, item) => sum + item.quantity, 0); }
  function subtotalCents() {
    return cart.reduce((sum, item) => {
      const product = getProduct(item.sku);
      return sum + (product ? product.priceCents * item.quantity : 0);
    }, 0);
  }
  function persistCart() {
    try { localStorage.setItem(STORAGE, JSON.stringify(cart)); } catch (_) { /* storage may be disabled */ }
  }
  function restoreCart() {
    let entries = [];
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      if (Array.isArray(stored)) entries = stored;
    } catch (_) { /* ignore old or corrupt data */ }
    let pieces = 0;
    cart = entries.filter(entry => {
      if (!entry || typeof entry.sku !== "string" ||
          !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 10 ||
          !getVariant(entry.sku) || pieces + entry.quantity > 20) return false;
      pieces += entry.quantity;
      return true;
    }).slice(0, 8);
    persistCart();
    renderCart();
  }
  function notify(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2500);
  }
  function clearQuote() {
    quote = null;
    selectedService = null;
    quoteVersion += 1;
    els.shippingOptions.replaceChildren();
    els.shippingMessage.textContent = "Informe o CEP e calcule o frete para sua sacola.";
  }
  function selectedOption() {
    return quote?.options?.find(option => option.service === selectedService) || null;
  }
  function updateTotals() {
    const subtotal = subtotalCents();
    const shipping = selectedOption();
    els.subtotal.textContent = money(subtotal);
    els.shippingValue.textContent = !cart.length ? "—" :
      shipping ? money(shipping.priceCents) : "A calcular";
    els.grandTotal.textContent = money(subtotal + (shipping?.priceCents || 0));
  }
  function renderCart() {
    els.items.replaceChildren();
    els.counter.textContent = String(countItems());
    els.shipping.hidden = cart.length === 0;
    if (!cart.length) {
      els.items.append(element("p", "empty-bag", "Sua sacola está vazia. Escolha uma peça da coleção."));
      updateTotals();
      return;
    }
    cart.forEach(entry => {
      const product = getProduct(entry.sku);
      const variant = getVariant(entry.sku);
      if (!product || !variant) return;
      const line = element("article", "bag-item");
      const info = element("div", "bag-product-info");
      info.append(element("strong", "", product.name));
      const variantText = [variant.color,variant.size].filter(Boolean).join(" / ") || variant.sku;
      info.append(element("p", "", variantText));
      info.append(element("p", "bag-item-price", money(product.priceCents * entry.quantity)));

      const actions = element("div", "bag-item-actions");
      const controls = element("div", "bag-qty");
      const less = element("button", "", "−");
      less.type = "button";
      less.setAttribute("aria-label", "Diminuir quantidade de " + product.name);
      less.disabled = entry.quantity <= 1;
      less.addEventListener("click", () => updateQuantity(entry.sku, -1));
      const quantity = element("span", "", String(entry.quantity));
      quantity.setAttribute("aria-label", "Quantidade");
      const more = element("button", "", "+");
      more.type = "button";
      more.disabled = entry.quantity >= 10 || countItems() >= 20;
      more.setAttribute("aria-label", "Aumentar quantidade de " + product.name);
      more.addEventListener("click", () => updateQuantity(entry.sku, 1));
      controls.append(less, quantity, more);
      const remove = element("button", "bag-remove", "Remover");
      remove.type = "button";
      remove.addEventListener("click", () => updateQuantity(entry.sku, -entry.quantity));
      actions.append(controls,remove);
      line.append(info,actions);
      els.items.append(line);
    });
    updateTotals();
  }
  function cartChanged() {
    persistCart();
    clearQuote();
    renderCart();
  }
  function updateQuantity(sku, delta) {
    const current = cart.find(entry => entry.sku === sku);
    if (!current) return;
    const newAmount = current.quantity + delta;
    if (newAmount > 10 || countItems() + delta > 20) {
      notify("Limite de 10 peças por variante e 20 peças na sacola.");
      return;
    }
    if (newAmount <= 0) cart = cart.filter(entry => entry.sku !== sku);
    else current.quantity = newAmount;
    cartChanged();
  }
  function addToCart(product, variant) {
    const current = cart.find(entry => entry.sku === variant.sku);
    if (countItems() >= 20 || (current && current.quantity >= 10)) {
      notify("Limite de peças na sacola atingido.");
      return;
    }
    if (current) current.quantity += 1;
    else {
      if (cart.length >= 8) {
        notify("A sacola aceita até oito variantes diferentes.");
        return;
      }
      cart.push({sku: variant.sku, quantity: 1});
    }
    cartChanged();
    notify(product.name + " adicionado à sacola.");
  }
  function productCard(product, index) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const card = element("article", "product-card");
    const visual = element("div", "product-visual visual-tee");
    visual.append(element("span", "product-label", "SWC / COLEÇÃO"));
    if (product.images?.[0]) {
      const photo = document.createElement("img");
      photo.className = "product-photo";
      photo.src = product.images[0];
      photo.alt = "Foto do produto " + product.name;
      photo.loading = "lazy";
      photo.decoding = "async";
      visual.append(photo);
    } else {
      visual.append(element("p", "product-no-photo", "Imagem em breve"));
    }
    visual.append(element("span", "product-ghost", String(index + 1).padStart(2, "0")));
    const info = element("div", "product-info");
    const details = element("div", "product-details");
    details.append(element("span", "", String(product.category || "SWC").toUpperCase()));
    details.append(element("h3", "", product.name));
    details.append(element("p", "", money(product.priceCents)));
    if (product.description) details.append(element("p", "product-description", product.description));
    const controls = element("div", "product-controls");
    if (!variants.length) {
      controls.append(element("p", "product-prelaunch", "Produto temporariamente indisponível"));
      const disabled = element("button", "add-btn product-disabled", "Indisponível");
      disabled.type = "button";
      disabled.disabled = true;
      controls.append(disabled);
    } else {
      const label = element("label", "product-variant-label", "Cor e tamanho");
      const selector = element("select", "product-variant");
      selector.setAttribute("aria-label", "Escolha cor e tamanho de " + product.name);
      variants.forEach(variant => {
        const option = document.createElement("option");
        option.value = variant.sku;
        option.textContent = [variant.color,variant.size].filter(Boolean).join(" / ") || variant.sku;
        selector.append(option);
      });
      label.append(selector);
      const add = element("button", "add-btn", "Adicionar à sacola +");
      add.type = "button";
      add.addEventListener("click", () => {
        const variant = variants.find(v => v.sku === selector.value);
        if (variant) addToCart(product,variant);
      });
      controls.append(label,add);
    }
    info.append(details,controls);
    card.append(visual,info);
    return card;
  }
  async function loadCatalog() {
    const grid = $(".products");
    try {
      const response = await fetch("/api/catalog",{cache:"no-store"});
      if (!response.ok) throw new Error("catalog_http");
      const data = await response.json();
      if (!Array.isArray(data?.products) || !data.products.length) throw new Error("catalog_empty");
      catalog = data.products.filter(p =>
        p && typeof p.id === "string" && typeof p.name === "string" &&
        Number.isSafeInteger(p.priceCents) && p.priceCents > 0 &&
        Array.isArray(p.variants)
      );
      if (!catalog.length) throw new Error("catalog_invalid");
      grid.replaceChildren(...catalog.map(productCard));
      const intro = $(".section-top > p");
      if (intro) intro.textContent = "Fotos, cores e tamanhos sincronizados com a Gubo. Monte sua sacola e consulte o frete aqui na SWC.";
      const note = $(".collection-note");
      if (note) note.textContent = "* Sacola e cotação em testes. Nenhum pedido ou pagamento é criado.";
      restoreCart();
    } catch (_) {
      if (grid) grid.replaceChildren(element("p","catalog-loading","Não foi possível carregar a coleção. Atualize a página para tentar novamente."));
    }
  }
  function showBag() {
    lastFocus = document.activeElement;
    els.overlay.hidden = false;
    els.panel.classList.add("open");
    els.panel.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    $("#close-bag").focus();
  }
  function hideBag() {
    els.panel.classList.remove("open");
    els.panel.setAttribute("aria-hidden","true");
    els.overlay.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus?.focus) lastFocus.focus();
  }
  function renderShippingOptions(options) {
    els.shippingOptions.replaceChildren();
    const valid = options.filter(o => typeof o.service === "string" && Number.isSafeInteger(o.priceCents));
    if (!valid.length) {
      els.shippingMessage.textContent = "Não há frete disponível para este CEP e esta sacola.";
      return;
    }
    els.shippingMessage.textContent = "Escolha uma opção de frete (cotação de teste):";
    valid.forEach((item, index) => {
      const label = element("label", "shipping-option");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "shipping-service";
      radio.value = item.service;
      radio.checked = selectedService === item.service;
      radio.addEventListener("change", () => {
        selectedService = item.service;
        updateTotals();
      });
      const details = element("span", "shipping-option-details");
      details.append(element("strong", "", item.name));
      const timing = item.businessDays != null ? item.businessDays + " dias úteis incluindo produção" : "Prazo a confirmar";
      details.append(element("small", "", timing));
      label.append(radio,details,element("b","",money(item.priceCents)));
      els.shippingOptions.append(label);
    });
    if (!selectedService || !valid.some(o => o.service === selectedService)) {
      selectedService = valid[0].service;
      const firstRadio = els.shippingOptions.querySelector('input[type="radio"]');
      if (firstRadio) firstRadio.checked = true;
    }
    updateTotals();
  }
  async function calculateShipping(event) {
    event.preventDefault();
    if (!cart.length) return;
    const cep = els.shippingInput.value.replace(/\D/g, "");
    if (!/^\d{8}$/.test(cep)) {
      els.shippingMessage.textContent = "Digite um CEP válido com oito números.";
      return;
    }
    const version = ++quoteVersion;
    quote = null; selectedService = null;
    els.shippingOptions.replaceChildren();
    els.shippingMessage.textContent = "Consultando frete na Gubo…";
    els.quoteButton.disabled = true;
    els.quoteButton.textContent = "Calculando…";
    updateTotals();
    try {
      const response = await fetch("/api/shipping-quote",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          cep,items:cart.map(item=>({sku:item.sku,quantity:item.quantity}))
        })
      });
      const payload = await response.json();
      if (version !== quoteVersion) return;
      if (response.status===202 || payload?.status==="pending") {
        els.shippingMessage.textContent = "A Gubo ainda está calculando. Tente novamente.";
        return;
      }
      if (!response.ok || payload?.status!=="ready") {
        const problems={
          variant_unavailable:"Uma variante ficou indisponível. Atualize a página.",
          unknown_product:"Um item não está disponível. Atualize a página.",
          too_many_requests:"Muitas consultas. Tente novamente em um minuto.",
          gubo_timeout:"A cotação demorou demais. Tente novamente.",
          gubo_quote_failed:"A Gubo não conseguiu calcular o frete para esta sacola."
        };
        els.shippingMessage.textContent=problems[payload?.error]||"Não conseguimos cotar o frete agora. Tente novamente.";
        return;
      }
      quote = payload;
      const options = payload.options || [];
      selectedService = options.some(o => o.service === payload.selection)
        ? payload.selection
        : [...options].sort((a,b) => a.priceCents - b.priceCents)[0]?.service || null;
      renderShippingOptions(options);
    } catch (_) {
      if (version === quoteVersion) els.shippingMessage.textContent = "Não foi possível conectar à Gubo. Tente novamente.";
    } finally {
      els.quoteButton.disabled = false;
      els.quoteButton.textContent = "Calcular";
    }
  }

  $("#open-bag").addEventListener("click",showBag);
  $("#close-bag").addEventListener("click",hideBag);
  els.overlay.addEventListener("click",hideBag);
  $("#keep-exploring").addEventListener("click",hideBag);
  els.shippingForm.addEventListener("submit",calculateShipping);
  els.shippingInput.addEventListener("input",() => {
    const v=els.shippingInput.value.replace(/\D/g,"").slice(0,8);
    els.shippingInput.value = v.length>5?v.slice(0,5)+"-"+v.slice(5):v;
    if (quote || els.shippingOptions.childElementCount) {
      clearQuote();
      updateTotals();
    }
  });
  document.addEventListener("keydown",event=>{
    if (event.key==="Escape"&&els.panel.classList.contains("open"))hideBag();
    if (event.key!=="Tab"||!els.panel.classList.contains("open"))return;
    const focusable=[...els.panel.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],select:not([disabled])')]
      .filter(node=>node.getClientRects().length>0);
    if (!focusable.length)return;
    if (event.shiftKey&&document.activeElement===focusable[0]) {
      event.preventDefault();focusable[focusable.length-1].focus();
    } else if(!event.shiftKey&&document.activeElement===focusable[focusable.length-1]){
      event.preventDefault();focusable[0].focus();
    }
  });
  loadCatalog();
  renderCart();
})();