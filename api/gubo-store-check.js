// Verificação da vitrine pública da Gubo Store para integração SWC.
// Esta rota não usa chave API, não lê dados privados e não cria pedidos.
const STORE_URL = "https://gubo.com.br/loja/swampchill";
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(STORE_URL, {
      method: "GET",
      headers: {
        "Accept": "text/html",
        "User-Agent": "SWC-Store-Integration/1.0"
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });
    const body = await upstream.text();
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || null;
    const description = body.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)?.[1] || null;
    return res.status(200).json({
      checked: true,
      publicStoreUrl: STORE_URL,
      upstreamStatus: upstream.status,
      finalOrigin: new URL(upstream.url).origin,
      finalPath: new URL(upstream.url).pathname,
      contentType: upstream.headers.get("content-type"),
      pageTitle: title?.slice(0, 180) || null,
      description: description?.slice(0, 250) || null,
      htmlLength: body.length,
      mentionsPantano: /pantano/i.test(body),
      mentionsOversized: /oversized/i.test(body),
      hasNextData: /__NEXT_DATA__|self\.__next_f\.push/.test(body),
      hasJsonLd: /application\/ld\+json/i.test(body),
      scripts: [...body.matchAll(/<script[^>]+src=["\x27]([^"\x27]+)["\x27]/gi)].map(m => m[1]).slice(0, 15),
      htmlStart: body.slice(0, 1800),
      htmlEnd: body.slice(-1800),
      loginPage: /entrar|faça login|sign in/i.test(body) && !/adicionar ao carrinho|comprar agora/i.test(body)
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error?.name === "AbortError" ? "upstream_timeout" : "store_unreachable"
    });
  } finally {
    clearTimeout(timer);
  }
};