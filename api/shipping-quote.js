// SWC — Cotação de frete Gubo em ambiente de teste.
// Não cria, altera, paga ou cancela pedidos. Não expõe credenciais.
// O catálogo e os SKUs disponíveis são validados novamente no servidor.
const { availableVariants, quoteShipping } = require("../lib/gubo-server");
const { priceItems } = require("../lib/cart-server");
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
  if(!/^\d{8}$/.test(cep)||!Array.isArray(input?.items)||input.items.length<1||input.items.length>8)return respond(res,422,{error:"invalid_quote_request"});
  const priced=priceItems(input.items);
  if(priced.error)return respond(res,422,{error:priced.error});
  let stage="catalog";
  try {
    const variants=await availableVariants(key);
    if(priced.lines.some(x=>!variants.has(x.sku)))return respond(res,422,{error:"variant_unavailable"});
    stage="quote";
    const quote=await quoteShipping(key,cep,priced.lines.map(l=>({sku:l.sku,quantidade:l.quantity})));
    if(quote.state==="pending")return respond(res,202,{status:"pending",message:"Cotação em andamento. Tente novamente."});
    if(quote.state!=="ready"){
      return quote.reason==="quote_not_ready"
        ? respond(res,502,{error:"quote_not_ready"})
        : respond(res,502,{error:"gubo_quote_failed",reason:quote.reason});
    }
    return respond(res,200,{
      status:"ready",sandbox:true,simulated:quote.simulated,
      subtotalCents:priced.subtotalCents,quantity:priced.quantity,
      expiresAt:quote.expiresAt,
      options:quote.options,selection:quote.selection
    });
  }catch(error){return respond(res,502,{error:error?.name==="AbortError"?"gubo_timeout":"quote_unavailable",phase:stage});}
};
