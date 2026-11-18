// TEMPORÁRIO (remover em seguida): lista produtos da conta Gubo (só leitura, sem chave na resposta).
"use strict";
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.GUBO_API_KEY;
  const read = async path => { const out=[]; let cursor=null;
    for (let i=0;i<10;i++){ const u=new URL("https://api.gubo.com.br/v1"+path); u.searchParams.set("limite","100"); if(cursor)u.searchParams.set("cursor",cursor);
      const r=await fetch(u,{headers:{Authorization:"Bearer "+key,Accept:"application/json"}}); const d=await r.json(); if(!r.ok) throw new Error("gubo_"+r.status);
      out.push(...(d.dados||[])); if(!d.tem_mais)break; cursor=d.proximo_cursor; } return out; };
  try {
    const [p,v]=await Promise.all([read("/catalogo/produtos?situacao=todos"),read("/catalogo/variantes?disponivel=true")]);
    res.status(200).json(p.map(x=>({codigo:x.codigo,nome:x.nome,situacao:x.situacao,modelo:x.modelo?.nome,atualizado:x.atualizado_em,
      cores:[...new Set(v.filter(y=>y.produto===x.codigo).map(y=>y.cor?.nome))],
      preco_ref:[...new Set(v.filter(y=>y.produto===x.codigo).map(y=>y.preco_unitario_centavos))]})));
  } catch(e){ res.status(502).json({error:e.message}); }
};
