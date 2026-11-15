// TEMPORÁRIO (remover em seguida): mostra os detalhes oficiais das chaves Gubo via GET /conexao.
// Devolve só nome, prefixo curto, modo, situação, escopos e expiração. Nunca a chave.
"use strict";
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const out = {};
  for (const [name, key] of [["GUBO_API_KEY", process.env.GUBO_API_KEY], ["GUBO_ORDERS_API_KEY", process.env.GUBO_ORDERS_API_KEY]]) {
    if (!key) { out[name] = "não configurada"; continue; }
    try {
      const r = await fetch("https://api.gubo.com.br/v1/conexao", { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
      const d = await r.json().catch(() => ({}));
      out[name] = r.ok ? {
        modo: d.modo, situacao: d.situacao, pagamento: d.pagamento,
        chave: { nome: d.chave?.nome, prefixo: String(d.chave?.prefixo || "").slice(0, 12), escopos: d.chave?.escopos, expira_em: d.chave?.expira_em },
        campos: Object.keys(d)
      } : { status: r.status, erro: d?.erro?.codigo || null };
    } catch (e) { out[name] = "erro " + e.message; }
  }
  res.status(200).json(out);
};
