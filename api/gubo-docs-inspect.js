// Temporary read-only diagnostic. Never return bearer token or customer information.
const DOCS_BASE="https://gubo.com.br";
function publicFields(data, depth=0) {
  if (depth > 2 || data===null || data===undefined) return null;
  if (Array.isArray(data)) return {type:"array",length:data.length,first:data.length?publicFields(data[0],depth+1):null};
  if (typeof data==="object") {
    const fields={};
    for(const [key,value] of Object.entries(data).slice(0,30)) {
      if (/senha|token|chave|secret|email|cpf|cnpj|telefone|endereco|nome_cliente|destinatario|pagamento/i.test(key)) {
        fields[key]="[redacted]"; continue;
      }
      fields[key]=publicFields(value,depth+1);
    }
    return fields;
  }
  if (typeof data==="string") return data.slice(0,100);
  if (typeof data==="number"||typeof data==="boolean") return data;
  return String(typeof data);
}
async function fetchDoc(path) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),6500);
  try {
    const r=await fetch(DOCS_BASE+path,{signal:controller.signal,headers:{Accept:"text/html"}});
    const html=await r.text();
    const title=html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]||"";
    const main=html.match(/<main[^>]*>([\s\S]+?)<\/main>/i)?.[1]||html;
    const clean=main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
      .replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ")
      .replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"')
      .replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
    const links=[...new Set([...main.matchAll(/href="(\/docs-api[^"]*)"/g)].map(x=>x[1]))].slice(0,65);
    const requests=[...new Set([...clean.matchAll(/(?:GET|POST|PATCH|DELETE|PUT)\s+\/v1\/[\w/-]+/g)].map(x=>x[0]))].slice(0,30);
    return {path,status:r.status,title,text:clean.slice(0,12500),links,requests};
  }catch(e){return {path,error:e.name||"fetch_failed"}}
  finally{clearTimeout(timer)}
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  const key=process.env.GUBO_API_KEY;
  if(!key||!key.startsWith("gubo_test_"))return res.status(503).json({error:"test_key_required"});
  const docs=await Promise.all(["/docs-api","/docs-api/inicio-rapido","/docs-api/vinculos","/docs-api/pedidos"].map(fetchDoc));
  let mapping;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const r=await fetch("https://api.gubo.com.br/v1/vinculos",{headers:{Authorization:"Bearer "+key,Accept:"application/json"},signal:controller.signal});
    const json=await r.json();
    mapping={status:r.status,rootKeys:Object.keys(json),dataCount:json.dados?.length||0,firstRecord:publicFields(json.dados?.[0]),secondRecord:publicFields(json.dados?.[1])};
  }catch(e){mapping={error:e.name||"failed"}}
  finally{clearTimeout(timer)}
  return res.status(200).json({docs,mapping});
};