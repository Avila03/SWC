// SWC — estado de preparação do Mercado Pago.
// Sem transações; não retorna tokens, chaves ou dados da conta.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const accessTokenConfigured = Boolean(
    typeof process.env.MP_TEST_ACCESS_TOKEN === "string" &&
    process.env.MP_TEST_ACCESS_TOKEN.trim().length > 20
  );
  const webhookSecretConfigured = Boolean(
    typeof process.env.MP_WEBHOOK_SECRET === "string" &&
    process.env.MP_WEBHOOK_SECRET.trim().length > 10
  );
  return res.status(200).json({
    provider: "mercado_pago",
    mode: "setup",
    testAccessTokenConfigured: accessTokenConfigured,
    webhookSecretConfigured,
    checkoutEnabled: false,
    ordersEnabled: false,
    nextStep: !accessTokenConfigured ? "configure_test_credentials" :
      !webhookSecretConfigured ? "configure_webhook_signature" : "implement_checkout"
  });
};