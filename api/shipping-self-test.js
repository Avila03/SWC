// One-time test of the actual SWC shipping handler with safe sandbox data.
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  const key=process.env.GUBO_ORDERS_API_KEY;
  if(!key?.startsWith("gubo_test_"))return res.status(503).json({error:"test_only"});
  const controller=new AbortController();const t=setTimeout(()=>controller.abort(),10000);
  try{
    const r=await fetch("https://api.gubo.com.br/v1/catalogo/variantes?disponivel=true&limite=1",{
      headers:{Authorization:"Bearer "+key,Accept:"application/json"},signal:controller.signal
    });
    const catalog=await r.json();
    const sku=catalog.dados?.[0]?.sku;
    if(!sku)return res.status(200).json({catalogStatus:r.status,status:"no_variant"});
    const quoteHandler=require("./shipping-quote");
    const mockedRes={
      code:null,body:null,
      setHeader(){return this;},
      status(code){this.code=code;return this;},
      json(value){this.body=value;return this;}
    };
    await quoteHandler({method:"POST",
      headers:{"content-type":"application/json","x-forwarded-for":"swc-internal-quote-smoke"},
      body:{cep:"01310100",items:[{sku,quantity:1}]}
    },mockedRes);
    return res.status(200).json({
      endpointStatus:mockedRes.code,
      quoteReady:mockedRes.body?.status==="ready",
      optionsCount:mockedRes.body?.options?.length||0,
      error:mockedRes.body?.error||null,
      createdOrders:0,paid:false
    });
  }catch(e){return res.status(502).json({error:e?.name==="AbortError"?"timeout":"smoke_failed"});}
  finally{clearTimeout(t);}
};