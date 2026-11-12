// SWC / Gubo: teste somente de leitura, executado no servidor.
// Nunca exporte GUBO_API_KEY para o navegador, nem registre o valor em logs.
const BASE = "https://api.gubo.com.br/v1";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const key = process.env.GUBO_API_KEY;
  if (!key) {
    return res.status(503).json({ ok: false, error: "not_configured" });
  }
  if (!key.startsWith("gubo_test_")) {
    // A fase inicial foi aprovada apenas para testes.
    return res.status(503).json({ ok: false, error: "test_key_required" });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    let upstream;
    try {
      upstream = await fetch(BASE + "/conexao", {
        method: "GET",
        headers: {
          "Authorization": "Bearer " + key,
          "Accept": "application/json"
        },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (upstream.ok) {
      // Evitar expor dados da conta ou token contidos na resposta da Gubo.
      return res.status(200).json({ ok: true, connection: "verified", mode: "test" });
    }

    const code = upstream.status;
    if (code === 401 || code === 403) {
      return res.status(502).json({ ok: false, error: "gubo_auth_failed", upstream_status: code });
    }
    return res.status(502).json({ ok: false, error: "gubo_request_failed", upstream_status: code });
  } catch (error) {
    const isTimeout = error && error.name === "AbortError";
    return res.status(502).json({ ok: false, error: isTimeout ? "gubo_timeout" : "gubo_unreachable" });
  }
};