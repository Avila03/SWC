const targets = [
  ["studio-docs","https://studio.gubo.com.br/docs-api/inicio-rapido"],
  ["api-openapi","https://api.gubo.com.br/openapi.json"],
  ["api-v1-openapi","https://api.gubo.com.br/v1/openapi.json"],
  ["api-v1-docs","https://api.gubo.com.br/v1/docs"],
  ["studio-swagger","https://studio.gubo.com.br/docs-api"]
];
function simplify(text, contentType) {
  const isHtml = String(contentType || "").includes("text/html");
  if (isHtml) {
    const title = text.match(/<title[^>]*>([^<]{0,160})<\/title>/i)?.[1] || "";
    const headings = [...text.matchAll(/<h[1-4][^>]*>([\s\S]{0,200}?)<\/h[1-4]>/gi)]
      .slice(0,12).map(x=>x[1].replace(/<[^>]*>/g, "").trim());
    const paths=[...new Set((text.match(/\/v1\/[a-zA-Z0-9/_-]+/g)||[]))].slice(0,30);
    return { title, headings, paths, length:text.length, snippet:text.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,1100) };
  }
  if (String(contentType||"").includes("application/json")) {
    try {
      const json=JSON.parse(text);
      return { version:json.openapi||json.swagger||null,info:json.info?{title:json.info.title,version:json.info.version}:null,
        paths:json.paths?Object.keys(json.paths).slice(0,50):[],
        keys:Object.keys(json).slice(0,10), preview:text.slice(0,350) };
    } catch { return {preview:text.slice(0,350)}; }
  }
  return {preview:text.slice(0,300), length:text.length};
}
module.exports=async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  const results=await Promise.all(targets.map(async ([name,url])=>{
    const controller=new AbortController();const t=setTimeout(()=>controller.abort(),6500);
    try{
      const response=await fetch(url,{headers:{"Accept":"text/html, application/json;q=0.9"},redirect:"follow",signal:controller.signal});
      const contentType=response.headers.get("content-type")||"";
      const body=(await response.text()).slice(0,300000);
      return {name,status:response.status,finalHost:new URL(response.url).hostname,contentType,summary:simplify(body,contentType)};
    }catch(e){return {name,error:e.name==="AbortError"?"timeout":"unreachable"};}
    finally{clearTimeout(t)}
  }));
  return res.status(200).json({results});
};