// SWC — Checkout em etapas: sacola → entrega → dados → Pix.
// Preço, frete e pedido são sempre recalculados no servidor. Dados pessoais só em memória.
(() => {
  "use strict";
  const S = window.SWC;
  const $ = s => document.querySelector(s);
  const val = id => ($(id)?.value || "").trim();
  const digits = s => String(s || "").replace(/\D/g, "");
  const UF = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

  let products = [];
  let cart = [];
  let quote = null;         // { options, expiresAt }
  let service = null;       // opção escolhida
  let quotedFor = "";       // CEP + sacola usados na cotação
  let current = 1;
  let attempt = { key: null, fp: null };
  let testEnabled = false;
  let busy = false;

  const ERR = {
    checkout_disabled: "O pagamento ainda não está disponível.",
    consent_required: "Marque a autorização para continuar.",
    invalid_name: "Informe nome e sobrenome.", invalid_email: "Confira o e-mail.",
    invalid_phone: "Confira o telefone com DDD.", invalid_cpf: "Confira o CPF.",
    invalid_cep: "Confira o CEP.", invalid_address: "Confira o endereço.",
    invalid_shipping_service: "Escolha uma opção de frete.",
    shipping_option_changed: "O frete mudou. Calcule de novo e escolha uma opção.",
    variant_unavailable: "Uma peça ficou indisponível. Revise a sacola.",
    quote_pending: "A cotação ainda está em andamento. Tente de novo.",
    too_many_requests: "Muitas tentativas. Aguarde um minuto.",
    order_already_processed: "Este pedido já foi processado."
  };

  const lines = () => cart.map(i => ({ ...i, ...(S.findBySku(products, i.sku) || {}) })).filter(l => l.product);
  const subtotal = () => lines().reduce((s, l) => s + l.product.priceCents * l.quantity, 0);
  const cartFp = () => JSON.stringify(cart);

  // ---------- Sacola ----------
  function renderItems() {
    const list = $("#c-items");
    const ls = lines();
    if (!ls.length) {
      list.replaceChildren(S.el("li", "c-empty"));
      list.firstChild.append(S.el("p", "", "Sua sacola está vazia."), Object.assign(S.el("a", "g-link", "Ver as coleções →"), { href: "/#colecao" }));
    } else {
      list.replaceChildren(...ls.map(l => {
        const li = S.el("li", "c-item");
        const fig = S.el("a", "c-item-img"); fig.href = "/produto.html?p=" + encodeURIComponent(l.product.id) + "&cor=" + encodeURIComponent(l.variant.color || "");
        const src = S.photo(l.product, l.variant.color, "back");
        if (src) { const img = S.el("img"); img.src = src; img.alt = ""; img.onerror = () => img.remove(); fig.append(img); }
        const meta = S.el("div", "c-item-meta");
        meta.append(S.el("strong", "", l.product.name), S.el("span", "", [l.variant.color, l.variant.size].filter(Boolean).join(" · ")), S.el("span", "c-item-price", S.money(l.product.priceCents)));
        const qty = S.el("div", "p-qty");
        const minus = S.el("button", "", "−"), plus = S.el("button", "", "+"), n = S.el("span", "", String(l.quantity));
        minus.type = plus.type = "button"; minus.setAttribute("aria-label", "Diminuir"); plus.setAttribute("aria-label", "Aumentar");
        minus.onclick = () => changeQty(l.sku, -1); plus.onclick = () => changeQty(l.sku, +1);
        qty.append(minus, n, plus);
        const rm = S.el("button", "c-remove", "Remover"); rm.type = "button"; rm.onclick = () => changeQty(l.sku, -99);
        li.append(fig, meta, qty, rm);
        return li;
      }));
    }
    $('[data-next="2"]').disabled = !ls.length;
    renderSummary();
  }
  function changeQty(sku, delta) {
    const total = cart.reduce((s, i) => s + i.quantity, 0);
    if (delta > 0 && total >= 20) return;
    cart = cart.map(i => i.sku === sku ? { ...i, quantity: Math.min(10, i.quantity + delta) } : i).filter(i => i.quantity > 0);
    S.writeCart(cart);
    invalidateQuote();
    renderItems();
  }

  // ---------- Resumo ----------
  function renderSummary() {
    const ls = lines();
    $("#c-mini").replaceChildren(...ls.map(l => {
      const li = S.el("li");
      const src = S.photo(l.product, l.variant.color, "back");
      const fig = S.el("span", "c-mini-img");
      if (src) { const img = S.el("img"); img.src = src; img.alt = ""; img.onerror = () => img.remove(); fig.append(img); }
      const q = S.el("b", "c-mini-q", String(l.quantity));
      fig.append(q);
      const t = S.el("span", "c-mini-t"); t.append(S.el("strong", "", l.product.name), S.el("small", "", [l.variant.color, l.variant.size].filter(Boolean).join(" · ")));
      li.append(fig, t, S.el("span", "c-mini-p", S.money(l.product.priceCents * l.quantity)));
      return li;
    }));
    const sub = subtotal();
    $("#t-sub").textContent = S.money(sub);
    $("#t-ship").textContent = service ? (service.priceCents ? S.money(service.priceCents) : "Grátis") : "a calcular";
    $("#t-total").textContent = S.money(sub + (service ? service.priceCents : 0));
  }

  // ---------- Etapas ----------
  function summaryOf(step) {
    if (step === 1) { const n = cart.reduce((s, i) => s + i.quantity, 0); return n + (n > 1 ? " peças · " : " peça · ") + S.money(subtotal()); }
    if (step === 2) return [service?.name, val("#f-street") + ", " + val("#f-number"), val("#f-city") + "/" + val("#f-state").toUpperCase()].filter(Boolean).join(" · ");
    if (step === 3) return val("#f-name") + " · " + val("#f-email");
    return "";
  }
  function go(step) {
    current = step;
    document.querySelectorAll(".c-step").forEach(sec => {
      const n = Number(sec.dataset.step);
      sec.classList.toggle("is-open", n === step);
      sec.classList.toggle("is-done", n < step);
      const edit = sec.querySelector(".c-edit");
      if (edit) edit.hidden = !(n < step);
      const sum = sec.querySelector(".c-step-summary");
      if (sum) sum.textContent = n < step ? summaryOf(n) : "";
    });
    const open = document.querySelector('.c-step[data-step="' + step + '"]');
    open?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    open?.querySelector("input,button")?.focus({ preventScroll: true });
  }
  document.querySelectorAll(".c-edit").forEach(b => b.addEventListener("click", () => go(Number(b.closest(".c-step").dataset.step))));
  document.querySelectorAll("[data-next]").forEach(b => b.addEventListener("click", () => {
    const next = Number(b.dataset.next);
    if (next === 3 && !validateShipping()) return;
    if (next === 4 && !validateData()) return;
    go(next);
  }));

  // ---------- Entrega ----------
  function invalidateQuote() {
    quote = null; service = null; quotedFor = "";
    $("#c-options").replaceChildren();
    renderSummary();
  }
  $("#f-cep").addEventListener("input", e => {
    const d = digits(e.target.value).slice(0, 8);
    e.target.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
    if (quotedFor && !quotedFor.startsWith(d + "|")) invalidateQuote();
    if (d.length === 8) fillAddress(d);
  });
  async function fillAddress(cep) {
    // Preenche rua, bairro e cidade pelo CEP (ViaCEP). Envia só o CEP.
    try {
      const r = await fetch("https://viacep.com.br/ws/" + cep + "/json/");
      const a = await r.json();
      if (a && !a.erro) {
        if (!val("#f-street")) $("#f-street").value = a.logradouro || "";
        if (!val("#f-district")) $("#f-district").value = a.bairro || "";
        $("#f-city").value = a.localidade || val("#f-city");
        $("#f-state").value = a.uf || val("#f-state");
      }
    } catch (_) { /* preenchimento manual */ }
    $("#c-address").hidden = false;
  }
  $("#c-quote").addEventListener("click", getQuote);
  $("#f-cep").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); getQuote(); } });
  async function getQuote() {
    const cep = digits(val("#f-cep")); const msg = $("#c-ship-msg");
    if (cep.length !== 8) { msg.textContent = "Digite um CEP com 8 números."; return; }
    if (!cart.length) { msg.textContent = "Sua sacola está vazia."; return; }
    const btn = $("#c-quote"); btn.disabled = true; msg.textContent = "Calculando o frete…";
    $("#c-address").hidden = false;
    try {
      for (let i = 0; i < 3; i++) {
        const r = await fetch("/api/shipping-quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cep, items: cart }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 202) { msg.textContent = "A transportadora está respondendo…"; await new Promise(res => setTimeout(res, 1800)); continue; }
        if (!r.ok || d.status !== "ready") { msg.textContent = d.error === "variant_unavailable" ? ERR.variant_unavailable : "Não foi possível calcular o frete agora. Tente de novo."; return; }
        quote = d; quotedFor = cep + "|" + cartFp();
        renderOptions(d.options, d.selection);
        msg.textContent = d.options.length ? "" : "Nenhuma opção de entrega para este CEP.";
        return;
      }
      msg.textContent = ERR.quote_pending;
    } catch (_) { msg.textContent = "Falha de conexão. Tente de novo."; }
    finally { btn.disabled = false; }
  }
  function renderOptions(options, selection) {
    const box = $("#c-options");
    box.replaceChildren(...options.map((o, i) => {
      const label = S.el("label", "c-option");
      const input = S.el("input"); input.type = "radio"; input.name = "ship"; input.value = o.service;
      const t = S.el("span", "c-option-t");
      t.append(S.el("strong", "", o.name), S.el("small", "", [o.carrier, o.businessDays ? o.businessDays + " dias úteis" : null].filter(Boolean).join(" · ")));
      label.append(input, t, S.el("b", "", o.priceCents ? S.money(o.priceCents) : "Grátis"));
      input.addEventListener("change", () => { service = o; renderSummary(); });
      if ((selection && o.service === selection) || (!selection && i === 0)) { input.checked = true; service = o; }
      return label;
    }));
    renderSummary();
  }
  function validateShipping() {
    const msg = $("#c-ship-msg");
    if (!service || quotedFor !== digits(val("#f-cep")) + "|" + cartFp()) { msg.textContent = "Calcule o frete e escolha uma opção."; return false; }
    const ok = val("#f-street").length >= 2 && val("#f-number") && val("#f-district").length >= 2 && val("#f-city").length >= 2 && UF.has(val("#f-state").toUpperCase());
    if (!ok) { msg.textContent = "Complete o endereço de entrega."; $("#c-address").hidden = false; return false; }
    msg.textContent = ""; return true;
  }

  // ---------- Dados ----------
  $("#f-cpf").addEventListener("input", e => {
    const d = digits(e.target.value).slice(0, 11);
    e.target.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  });
  $("#f-phone").addEventListener("input", e => {
    const d = digits(e.target.value).slice(0, 11);
    e.target.value = d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3") : d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (m, a, b, c) => a + (b ? ") " + b : "") + (c ? "-" + c : "")).replace(/^(\d{2})\)/, "($1)");
  });
  function validCpf(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += Number(cpf[i]) * (len + 1 - i); if ((s * 10) % 11 % 10 !== Number(cpf[len])) return false; }
    return true;
  }
  function validateData() {
    const msg = $("#c-data-msg");
    if (val("#f-name").split(" ").filter(Boolean).length < 2) return (msg.textContent = ERR.invalid_name, false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val("#f-email"))) return (msg.textContent = ERR.invalid_email, false);
    if (!/^\d{10,11}$/.test(digits(val("#f-phone")))) return (msg.textContent = ERR.invalid_phone, false);
    if (!validCpf(digits(val("#f-cpf")))) return (msg.textContent = ERR.invalid_cpf, false);
    msg.textContent = ""; return true;
  }

  // ---------- Pagamento ----------
  $("#c-pay").addEventListener("click", async () => {
    if (busy) return;
    const msg = $("#c-pay-msg");
    if (!testEnabled) { msg.textContent = ERR.checkout_disabled; return; }
    if (!validateShipping()) return go(2);
    if (!validateData()) return go(3);
    if (!$("#f-consent").checked) { msg.textContent = ERR.consent_required; return; }
    const fp = JSON.stringify([cart, digits(val("#f-cep")), service.service]);
    if (!attempt.key || attempt.fp !== fp) attempt = { key: crypto.randomUUID(), fp };
    busy = true; const btn = $("#c-pay"); btn.disabled = true; btn.textContent = "Gerando Pix…"; msg.textContent = "";
    try {
      const r = await fetch("/api/checkout-test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: attempt.key, consent: true,
          customer: { name: val("#f-name"), email: val("#f-email"), phone: val("#f-phone"), cpf: val("#f-cpf") },
          address: { cep: digits(val("#f-cep")), street: val("#f-street"), number: val("#f-number"), complement: val("#f-complement") || null, district: val("#f-district"), city: val("#f-city"), state: val("#f-state").toUpperCase() },
          shippingService: service.service, items: cart
        })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.status === "awaiting_payment") { showPix(d); return; }
      if (r.status === 422 || r.status === 409) attempt = { key: null, fp: null };
      msg.textContent = ERR[d.error] || "Não foi possível gerar o Pix agora. Tente de novo.";
      if (d.error === "shipping_option_changed") { invalidateQuote(); go(2); }
    } catch (_) {
      msg.textContent = "Falha de conexão. Tente de novo; o mesmo pedido será reaproveitado.";
    } finally { busy = false; btn.disabled = false; btn.textContent = "Gerar Pix"; }
  });
  function showPix(d) {
    const box = $("#c-result"); box.replaceChildren();
    box.append(S.el("p", "g-kicker", "PEDIDO " + d.orderReference));
    box.append(S.el("h3", "", "Pague com Pix para garantir sua peça."));
    if (d.pix?.qrCodeBase64 && /^[A-Za-z0-9+/=]+$/.test(d.pix.qrCodeBase64)) {
      const img = S.el("img", "c-qr"); img.alt = "QR Code Pix"; img.src = "data:image/png;base64," + d.pix.qrCodeBase64; box.append(img);
    }
    if (d.pix?.qrCode) {
      const code = S.el("textarea", "c-code"); code.readOnly = true; code.value = d.pix.qrCode; code.setAttribute("aria-label", "Pix copia e cola");
      const copy = S.el("button", "p-btn", "Copiar código Pix"); copy.type = "button";
      copy.onclick = async () => { try { await navigator.clipboard.writeText(code.value); copy.textContent = "Código copiado"; } catch (_) { code.select(); } };
      box.append(code, copy);
    }
    if (d.pix?.ticketUrl) { const a = S.el("a", "g-link", "Abrir instruções do Pix →"); a.href = d.pix.ticketUrl; a.target = "_blank"; a.rel = "noopener noreferrer"; box.append(a); }
    box.append(S.el("p", "c-note", "Total " + S.money(d.totalCents) + ". Assim que o pagamento for confirmado, seu pedido segue para produção."));
    box.hidden = false;
    document.querySelector(".c-pix-card").hidden = true;
    document.querySelector(".c-consent").hidden = true;
    $("#c-pay").closest(".c-step-actions").hidden = true;
    S.writeCart([]); // o pedido já foi criado; a sacola recomeça
    document.querySelectorAll(".c-edit").forEach(b => { b.hidden = true; b.disabled = true; });
    const status = S.el("p", "c-status", "Aguardando o pagamento…"); status.setAttribute("role", "status");
    box.append(status);
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    watchPayment(d.orderReference, attempt.key, box, status);
  }

  // Consulta o estado do pedido até o Pix ser confirmado (a confirmação vem do webhook no servidor).
  function watchPayment(reference, key, box, status) {
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const r = await fetch("/api/order-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderReference: reference, key }) });
        const d = await r.json().catch(() => ({}));
        if (d.status === "paid") {
          box.replaceChildren(
            S.el("p", "g-kicker", "PEDIDO " + reference),
            S.el("h3", "", "Pagamento confirmado."),
            S.el("p", "c-note", "Sua peça entrou na fila de produção. Guarde o número do pedido."),
            Object.assign(S.el("a", "p-btn", "Voltar à loja"), { href: "/" }));
          box.classList.add("is-paid"); return;
        }
        if (d.status === "cancelled") { status.textContent = "Este Pix expirou ou foi cancelado. Gere um novo pedido para continuar."; return; }
      } catch (_) { /* tenta de novo */ }
      if (tries < 180) setTimeout(tick, document.hidden ? 15000 : 6000);
      else status.textContent = "Ainda não recebemos a confirmação. Se você já pagou, ela pode levar alguns minutos.";
    };
    setTimeout(tick, 6000);
  }

  // ---------- Início ----------
  async function init() {
    cart = S.readCart();
    try { products = (await S.fetchCatalog()).products; } catch (_) { products = []; }
    cart = cart.filter(i => S.findBySku(products, i.sku));
    S.writeCart(cart);
    renderItems();
    go(1);
    try {
      const r = await fetch("/api/mercadopago-readiness", { cache: "no-store" }).then(x => x.json());
      testEnabled = r?.testCheckoutEnabled === true;
    } catch (_) { testEnabled = false; }
    $("#c-test-note").hidden = !testEnabled;
    if (!testEnabled) { $("#c-pay").disabled = true; $("#c-pay").textContent = "Pagamento em preparação"; }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
