// Verificação temporária e exclusivamente de leitura do Access Token Mercado Pago.
// Não cria pagamentos, não solicita CPF nem expõe qualquer credencial.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const token = process.env.MP_TEST_ACCESS_TOKEN;
  if (typeof token !== "string" || !token.trim()) {
    return res.status(200).json({ configured: false, authenticated: false, reason: "missing_credentials" });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    // O corpo da resposta inclui identificadores de conta. Não repassá-lo ao navegador.
    return res.status(200).json({
      configured: true,
      authenticated: response.ok,
      authStatus: response.status,
      context: "mercado_pago_users_me",
      checkoutEnabled: false,
      createdPayments: 0
    });
  } catch (e) {
    return res.status(200).json({
      configured: true,
      authenticated: false,
      reason: e?.name === "AbortError" ? "timeout" : "auth_endpoint_unreachable",
      checkoutEnabled: false,
      createdPayments: 0
    });
  } finally {
    clearTimeout(timeout);
  }
};