// Diagnóstico temporário restrito a requisições GET de leitura.
// Nunca retorna chave ou dados dos pedidos/clientes.
const endpoints = [
  ["conexao","/v1/conexao"],
  ["vinculos","/v1/vinculos"],
  ["produtos","/v1/produtos"],
  ["catalogo","/v1/catalogo"],
  ["variantes","/v1/variantes"],
  ["pedidos","/v1/pedidos"],
  ["itens","/v1/itens"]
];
const docs=[
  ["public-docs","https://gubo.com.br/docs-api/inicio-rapido"],
  ["public-docs-index","https://gubo.com.br/docs-api"],
  ["public-docs-errors","https://gubo.com.br/docs-api/erros"]
];
async function getStatus(url,headers={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(url,{method:"GET",headers,redirect:"follow",signal:controller.signal});
    const text=(await response.text()).slice(0,300000);
    const type=response.headers.get("content-type")||"";
    const data={status:response.status,type,host:new URL(response.url).hostname};
    if(type.includes("application/json")) {
      try {
        const parsed=JSON.parse(text);
        data.shape=Array.isArray(parsed)?"array":typeof parsed;
        if(Array.isArray(parsed))data.count=parsed.length;
        else if(parsed && typeof parsed==="object"){
          data.keys=Object.keys(parsed).slice(0,15);
          // APIs que retornam erro: mostrar só o código, sem campos de clientes.
          data.errorCode=parsed.erro?.codigo||parsed.error?.code||parsed.codigo||null;
          data.fieldShape=Object.entries(parsed).filter(([,value])=>Array.isArray(value)).map(([name,arr])=>({name,count:arr.length})).slice(0,5);
        }
      }catch{data.jsonInvalid=true;}
    } else if(type.includes("text/html")){
      data.title=text.match(/<title[^>]*>([^<]{0,160})<\/title>/i)?.[1]||"";
      data.length=text.length;
      data.headings=[...text.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)].slice(0,10).map(x=>x[1].replace(/<[^>]+>/g,"").trim());
    }
    return data;
  }catch(e){return {status:null,error:e.name==="AbortError"?"timeout":"unreachable"};}
  finally{clearTimeout(timer);}
}
module.exports=async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  const key=process.env.GUBO_API_KEY;
  if(!key||!key.startsWith("gubo_test_"))return res.status(503).json({error:"test_key_required"});
  const results=await Promise.all(endpoints.map(async ([name,path])=>({
    name,...await getStatus("https://api.gubo.com.br"+path,{"Authorization":"Bearer "+key,"Accept":"application/json"})
  })));
  const publicDocs=await Promise.all(docs.map(async ([name,url])=>({name,...await getStatus(url,{"Accept":"text/html"})})));
  return res.status(200).json({checks:results,docs:publicDocs});
};