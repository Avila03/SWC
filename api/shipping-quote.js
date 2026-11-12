// SWC — Cotação de frete Gubo em ambiente de teste.
// Não cria, altera, paga ou cancela pedidos. Não expõe credenciais.
// O catálogo e os SKUs disponíveis são validados novamente no servidor.
const { products } = require("../data/catalog.json");
const BASE = "https://api.gubo.com.br/v1";
const usage = new Map();

function respond(res,status,body) { return res.status(status).json(body); }
function limited(req) {
  const id = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "unknown").split(",")[0].slice(0,90);
  const now = Date.now();
  const list = (usage.get(id)||[]).filter(t=>now-t<60000);
  list.push(now);usage.set(id,list);
  if (usage.size>250) for (const [k,v] of usage) if (!v.length||now-v[v.length-1]>60000) usage.delete(k);
  return list.length>8;
}
async function gubo(path,key,options={}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),10000);
  try {
    const response = await fetch(BASE+path,{
      method:options.method||"GET",
      headers:{
        Authorization:"Bearer "+key,
        Accept:"application/json",
        ...(options.body?{"Content-Type":"application/json"}:{}),
        ...(options.prefer?{"Prefer":options.prefer}:{})
      },
      body:options.body ? JSON.stringify(options.body) : undefined,
      redirect:"error",
      cache:"no-store",
      signal:controller.signal
    });
    const data = await response.json().catch(()=>({}));
    return {status:response.status,data};
  }finally{clearTimeout(timer);}
}
async function availableSkus(key) {
  const out = new Set(),seen=new Set();
  let cursor=null;
  for(let i=0;i<10;i++) {
    const url=new URL(BASE+"/catalogo/variantes");
    url.searchParams.set("disponivel","true");
    url.searchParams.set("limite","100");
    if(cursor)url.searchParams.set("cursor",cursor);
    const r=await gubo("/catalogo/variantes"+url.search,key);
    if(r.status!==200 || !Array.isArray(r.data?.dados))throw new Error("catalog_unavailable");
    for(const item of r.data.dados) {
      if(item?.disponivel === true && item?.sku && item?.produto)out.add(String(item.sku));
    }
    if(!r.data.tem_mais)return out;
    cursor=r.data.proximo_cursor;
    if(!cursor||seen.has(cursor))throw new Error("invalid_pagination");
    seen.add(cursor);
  }
  throw new Error("pagination_limit");
}
module.exports=async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return respond(res,405,{error:"method_not_allowed"});}
  const key=process.env.GUBO_ORDERS_API_KEY;
  if(!key||!key.startsWith("gubo_test_"))return respond(res,503,{error:"test_mode_not_configured"});
  if(limited(req))return respond(res,429,{error:"too_many_requests"});
  if(!String(req.headers["content-type"]||"").toLowerCase().includes("application/json"))return respond(res,415,{error:"json_required"});
  if(Number(req.headers["content-length"]||0)>3500)return respond(res,413,{error:"payload_too_large"});
  const input=req.body && typeof req.body==="object" && !Array.isArray(req.body) ? req.body : null;
  const cep=String(input?.cep||"").replace(/\D/g,"");
  const items=input?.items;
  if(!/^\d{8}$/.test(cep)||!Array.isArray(items)||items.length<1||items.length>8)return respond(res,422,{error:"invalid_quote_request"});
  const prices=new Map();
  for(const p of products||[]) {
    if(p?.active===true && p?.guboProductCode && Number.isInteger(p.priceCents)&&p.priceCents>0)prices.set(String(p.guboProductCode),p.priceCents);
  }
  const entries=[];const dedup=new Set();
  let count=0,subtotal=0;
  for(const item of items) {
    const sku=item?.sku;
    const quantity=item?.quantity;
    if(typeof sku!=="string"||!/^[A-Za-z0-9._\/-]{1,90}$/.test(sku)
       ||!Number.isInteger(quantity)||quantity<1||quantity>10||dedup.has(sku))
      return respond(res,422,{error:"invalid_items"});
    dedup.add(sku);count+=quantity;
    if(count>20)return respond(res,422,{error:"too_many_items"});
    const code=(products||[]).find(p=>p?.active===true && p?.guboProductCode && sku.startsWith(String(p.guboProductCode)+"-"))?.guboProductCode;
    if(!code||!prices.has(String(code)))return respond(res,422,{error:"unknown_product"});
    subtotal+=prices.get(String(code))*quantity;
    entries.push({sku,quantidade:quantity});
  }
  let stage="catalog";
  try {
    const all=await availableSkus(key);
    if(entries.some(x=>!all.has(x.sku)))return respond(res,422,{error:"variant_unavailable"});
    stage="quote";
    const first=await gubo("/fretes/cotacoes",key,{
      method:"POST",body:{cep,itens:entries,entrega:{preferencia:"mais_barata"}}
    });
    if(first.status!==201&&first.status!==202) {
      const err=first.data?.erro?.codigo;
      return respond(res,502,{error:"gubo_quote_failed",reason:typeof err==="string"?err.slice(0,65):null});
    }
    let quote=first.data;
    if(quote?.situacao==="pendente"&&typeof quote?.id==="string") {
      const poll=await gubo("/fretes/cotacoes/"+encodeURIComponent(quote.id),key,{prefer:"wait=8"});
      if(poll.status===200)quote=poll.data;
    }
    if(quote?.situacao==="pendente")return respond(res,202,{status:"pending",message:"Cotação em andamento. Tente novamente."});
    if(quote?.situacao!=="pronta" || !Array.isArray(quote.opcoes))
      return respond(res,502,{error:"quote_not_ready"});
    const options=quote.opcoes.filter(o=>typeof o?.servico==="string"&&Number.isSafeInteger(o?.preco_centavos)&&o.preco_centavos>=0).map(o=>({
      service:o.servico,name:String(o.nome||o.transportadora||"Frete").slice(0,100),
      carrier:String(o.transportadora||"").slice(0,70),
      priceCents:o.preco_centavos,
      businessDays:Number.isSafeInteger(o.prazo_total_dias_uteis)?o.prazo_total_dias_uteis:null,
      estimatedDelivery:typeof o.previsao_entrega==="string"?o.previsao_entrega:null
    }));
    return respond(res,200,{
      status:"ready",sandbox:true,simulated:Boolean(quote.simulada),
      subtotalCents:subtotal,quantity:count,
      expiresAt:quote.valida_ate||null,
      options,selection:quote.escolha?.servico||null
    });
  }catch(error){return respond(res,502,{error:error?.name==="AbortError"?"gubo_timeout":"quote_unavailable",phase:stage});}
};