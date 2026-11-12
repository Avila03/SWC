// One-time sandbox diagnostic for SWC; no real orders or payments.
module.exports=async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  const key=process.env.GUBO_ORDERS_API_KEY;
  if(!key?.startsWith("gubo_test_"))return res.status(503).json({status:"test_key_required"});
  const controller=new AbortController();const t=setTimeout(()=>controller.abort(),11000);
  try {
    const base="https://api.gubo.com.br/v1";
    const cat=await fetch(base+"/catalogo/variantes?disponivel=true&limite=1",{
      headers:{Authorization:"Bearer "+key,Accept:"application/json"},
      signal:controller.signal
    });
    const catalog=await cat.json();
    const sku=cat.status===200?catalog.dados?.[0]?.sku:null;
    if(!sku)return res.status(200).json({catalogStatus:cat.status,quoteStatus:null,catalogError:catalog.erro?.codigo||null});
    const response=await fetch(base+"/fretes/cotacoes",{
      method:"POST",
      headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({cep:"01310-100",itens:[{sku,quantidade:1}],entrega:{preferencia:"mais_barata"}}),
      signal:controller.signal
    });
    const quote=await response.json();
    return res.status(200).json({
      catalogStatus:cat.status,quoteStatus:response.status,
      quoteState:quote.situacao||null,
      errorCode:quote.erro?.codigo||null,
      optionsCount:Array.isArray(quote.opcoes)?quote.opcoes.length:null,
      isTest:true,createdOrders:0,charged:false
    });
  }catch(e){return res.status(502).json({error:e?.name==="AbortError"?"timeout":"gubo_unreachable"});}
  finally{clearTimeout(t);}
};