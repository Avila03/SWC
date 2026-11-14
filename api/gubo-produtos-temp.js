// TEMPORÁRIO (remover em seguida): lista os produtos da conta Gubo para cadastrar a coleção Espécimes.
// Só leitura; devolve apenas código, nome, datas, cores, tamanhos e os nomes dos campos (sem valores sensíveis).
"use strict";
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.GUBO_API_KEY;
  if (!key) return res.status(503).json({ error: "no_key" });
  const read = async path => {
    const out = []; let cursor = null;
    for (let i = 0; i < 10; i++) {
      const u = new URL("https://api.gubo.com.br/v1" + path); u.searchParams.set("limite", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      const r = await fetch(u, { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
      const d = await r.json(); if (!r.ok) throw new Error("gubo_" + r.status);
      out.push(...(d.dados || [])); if (!d.tem_mais) break; cursor = d.proximo_cursor;
    }
    return out;
  };
  try {
    const [prods, vars] = await Promise.all([read("/catalogo/produtos"), read("/catalogo/variantes")]);
    res.status(200).json({
      fields: prods[0] ? Object.keys(prods[0]) : [],
      products: prods.map(p => ({
        codigo: p.codigo, nome: p.nome, criado: p.criado_em || p.criado || null,
        modelo: p.modelo?.nome || p.modelo || p.base || null,
        precos: Object.fromEntries(Object.entries(p).filter(([k, v]) => /preco|valor|custo/i.test(k) && typeof v !== "object")),
        variantes: vars.filter(v => v.produto === p.codigo).map(v => (v.cor?.nome || "") + "/" + (v.tamanho || "") + (v.disponivel ? "" : " (indisp.)"))
      }))
    });
  } catch (e) { res.status(502).json({ error: e.message }); }
};
