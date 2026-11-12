// Teste temporário, exclusivamente de leitura, para credencial Supabase da SWC.
// Sem retorno de credenciais, registros, dados pessoais ou SQL.
const HOST="sclerlfknowmjwceehwh.supabase.co";
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  const key=process.env.SUPABASE_SECRET_KEY;
  const raw=process.env.SUPABASE_URL;
  if(!key||!raw)return res.status(200).json({configured:false,connected:false,reason:"missing_config"});
  let root;
  try{
    const u=new URL(raw);
    if(u.protocol!=="https:"||u.hostname!==HOST)return res.status(200).json({configured:true,connected:false,reason:"unexpected_project"});
    root=u.origin;
  }catch{return res.status(200).json({configured:true,connected:false,reason:"invalid_url"});}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
  try{
    const response=await fetch(root+"/rest/v1/swc_orders?select=id&limit=1",{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{apikey:key,Accept:"application/json",...(key.startsWith("eyJ")?{Authorization:"Bearer "+key}:{})},
      signal:controller.signal
    });
    let reason=null;
    if(!response.ok){
      const body=await response.json().catch(()=>({}));
      reason=typeof body?.code==="string"?body.code.slice(0,50):"access_denied";
    }
    return res.status(200).json({
      configured:true,connected:response.ok,readStatus:response.status,reason,
      test:"swc_orders_read_only",writes:0,checkoutEnabled:false
    });
  }catch(e){return res.status(200).json({
    configured:true,connected:false,reason:e?.name==="AbortError"?"timeout":"connection_error",
    writes:0,checkoutEnabled:false
  });}
  finally{clearTimeout(timer);}
};