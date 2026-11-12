// SWC — Formulário do checkout Pix de TESTE.
// Só aparece quando o servidor informa testCheckoutEnabled=true.
// Dados pessoais ficam apenas em memória (nada em localStorage).
(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const STORAGE = "swc.cart.v1";
  const money = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  let attemptKey = null;
  let attemptFingerprint = null;
  let busy = false;

  const ERRORS = {
    checkout_disabled: "O checkout de teste está desligado.",
    consent_required: "Confirme o uso dos dados para o pedido de teste.",
    invalid_name: "Informe nome e sobrenome.",
    invalid_email: "Confira o e-mail.",
    invalid_phone: "Confira o telefone com DDD.",
    invalid_cpf: "Confira o CPF.",
    invalid_cep: "Confira o CEP.",
    invalid_address: "Confira o endereço.",
    invalid_shipping_service: "Calcule o frete e escolha uma opção.",
    shipping_option_changed: "O frete mudou. Calcule de novo e escolha uma opção.",
    variant_unavailable: "Uma variante ficou indisponível. Atualize a página.",
    quote_pending: "A Gubo ainda está cotando o frete. Tente novamente.",
    too_many_requests: "Muitas tentativas. Aguarde um minuto.",
    order_already_processed: "Este pedido já foi processado."
  };

  function readCart() {
    try {
      const items = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      return Array.isArray(items) ? items.filter(i => typeof i?.sku === "string" && Number.isInteger(i?.quantity))
        .map(i => ({ sku: i.sku, quantity: i.quantity })) : [];
    } catch (_) { return []; }
  }

  function field(name, label, attrs = {}) {
    const wrap = document.createElement("label");
    wrap.className = "tc-field";
    wrap.append(document.createTextNode(label));
    const input = document.createElement("input");
    input.name = name;
    for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
    wrap.append(input);
    return wrap;
  }

  function buildForm() {
    const section = document.createElement("section");
    section.className = "bag-shipping tc-section";
    section.id = "test-checkout";
    section.hidden = true;
    const title = document.createElement("h3");
    title.textContent = "Dados do pedido (teste)";
    const help = document.createElement("p");
    help.className = "bag-help";
    help.textContent = "Ambiente de testes do Mercado Pago. Nenhum valor real é cobrado.";
    const form = document.createElement("form");
    form.id = "test-checkout-form";
    form.noValidate = true;
    form.append(
      field("name", "Nome completo", { autocomplete: "name", maxlength: "120", required: "" }),
      field("email", "E-mail", { type: "email", autocomplete: "email", maxlength: "160", required: "" }),
      field("phone", "Telefone com DDD", { type: "tel", autocomplete: "tel", inputmode: "numeric", maxlength: "15", required: "" }),
      field("cpf", "CPF", { inputmode: "numeric", maxlength: "14", required: "" }),
      field("street", "Rua", { autocomplete: "address-line1", maxlength: "120", required: "" }),
      field("number", "Número", { maxlength: "12", required: "" }),
      field("complement", "Complemento (opcional)", { autocomplete: "address-line2", maxlength: "80" }),
      field("district", "Bairro", { maxlength: "80", required: "" }),
      field("city", "Cidade", { autocomplete: "address-level2", maxlength: "80", required: "" }),
      field("state", "UF", { autocomplete: "address-level1", maxlength: "2", required: "" })
    );
    const consent = document.createElement("label");
    consent.className = "tc-consent";
    const box = document.createElement("input");
    box.type = "checkbox"; box.name = "consent";
    consent.append(box, document.createTextNode(" Autorizo o uso destes dados para criar o pedido de teste."));
    form.append(consent);
    const status = document.createElement("p");
    status.className = "shipping-message"; status.id = "test-checkout-status";
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const result = document.createElement("div");
    result.id = "test-checkout-result"; result.className = "tc-result";
    section.append(title, help, form, status, result);
    return section;
  }

  function showPix(payload) {
    const result = $("#test-checkout-result");
    result.replaceChildren();
    const head = document.createElement("p");
    head.className = "tc-ref";
    head.textContent = "Pedido " + payload.orderReference + " · " + money(payload.totalCents);
    result.append(head);
    if (payload.pix?.qrCodeBase64 && /^[A-Za-z0-9+/=]+$/.test(payload.pix.qrCodeBase64)) {
      const img = document.createElement("img");
      img.alt = "QR Code Pix de teste";
      img.src = "data:image/png;base64," + payload.pix.qrCodeBase64;
      img.className = "tc-qr";
      result.append(img);
    }
    if (payload.pix?.qrCode) {
      const code = document.createElement("textarea");
      code.readOnly = true; code.className = "tc-code"; code.value = payload.pix.qrCode;
      code.setAttribute("aria-label", "Pix copia e cola");
      const copy = document.createElement("button");
      copy.type = "button"; copy.className = "button button-ghost"; copy.textContent = "Copiar código Pix";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(code.value); copy.textContent = "Copiado"; }
        catch (_) { code.select(); }
      });
      result.append(code, copy);
    }
    if (payload.pix?.ticketUrl) {
      const link = document.createElement("a");
      link.href = payload.pix.ticketUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.className = "tc-link"; link.textContent = "Abrir instruções do Pix";
      result.append(link);
    }
    const note = document.createElement("p");
    note.className = "bag-help";
    note.textContent = "A confirmação do pagamento vem do Mercado Pago, não desta tela.";
    result.append(note);
  }

  async function submit() {
    if (busy) return;
    const form = $("#test-checkout-form");
    const status = $("#test-checkout-status");
    const items = readCart();
    const service = document.querySelector('input[name="shipping-service"]:checked')?.value;
    const cep = ($("#shipping-cep")?.value || "").replace(/\D/g, "");
    if (!items.length) { status.textContent = "Sua sacola está vazia."; return; }
    if (!service || cep.length !== 8) { status.textContent = ERRORS.invalid_shipping_service; return; }
    const data = new FormData(form);
    // Mesma sacola + CEP + frete reaproveita a chave (evita pedido duplicado); qualquer mudança gera outra.
    const fingerprint = JSON.stringify([items, cep, service]);
    if (!attemptKey || fingerprint !== attemptFingerprint) {
      attemptKey = crypto.randomUUID();
      attemptFingerprint = fingerprint;
    }
    busy = true;
    const button = $("#checkout-action");
    button.disabled = true; button.textContent = "Gerando Pix de teste…";
    status.textContent = "Criando pedido e cobrança de teste…";
    try {
      const response = await fetch("/api/checkout-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: attemptKey,
          consent: data.get("consent") === "on",
          customer: { name: data.get("name"), email: data.get("email"), phone: data.get("phone"), cpf: data.get("cpf") },
          address: {
            cep, street: data.get("street"), number: data.get("number"), complement: data.get("complement") || null,
            district: data.get("district"), city: data.get("city"), state: String(data.get("state") || "").toUpperCase()
          },
          shippingService: service,
          items
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.status === "awaiting_payment") {
        status.textContent = "Pix de teste gerado.";
        showPix(payload);
        form.hidden = true;
        button.textContent = "Pix gerado";
        return;
      }
      // Erros de validação não criam pedido: libera nova tentativa com outra chave.
      if (response.status === 422 || response.status === 409) attemptKey = null;
      status.textContent = ERRORS[payload?.error] || "Não foi possível gerar o Pix de teste agora. Tente novamente.";
      button.disabled = false; button.textContent = "Gerar Pix de teste";
    } catch (_) {
      status.textContent = "Falha de conexão. Tente novamente; o mesmo pedido será reaproveitado.";
      button.disabled = false; button.textContent = "Gerar Pix de teste";
    } finally {
      busy = false;
    }
  }

  async function init() {
    let ready;
    try {
      const response = await fetch("/api/mercadopago-readiness", { cache: "no-store" });
      ready = await response.json();
    } catch (_) { return; }
    if (ready?.testCheckoutEnabled !== true) return;

    const shipping = $("#bag-shipping");
    const button = $("#checkout-action");
    if (!shipping || !button) return;
    const section = buildForm();
    shipping.after(section);
    const sync = () => { section.hidden = shipping.hidden; };
    new MutationObserver(sync).observe(shipping, { attributes: true, attributeFilter: ["hidden"] });
    sync();

    const note = document.querySelector(".bag-safety-note");
    if (note) note.textContent = "Checkout em modo de TESTE: Pix do sandbox Mercado Pago, sem cobrança real.";
    button.disabled = false;
    button.textContent = "Gerar Pix de teste";
    button.addEventListener("click", submit);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
