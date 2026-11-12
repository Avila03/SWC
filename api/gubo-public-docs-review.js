// Temporary read-only extractor for publicly available Gubo API documentation.
const allowed=["fretes","criar-pedido","webhooks","pagar","teste"];
module.exports=async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"method_not_allowed"});}
 const page=String(req.query?.page||"fretes");
 if(!allowed.includes(page)) return res.status(400).json({error:"invalid_page"});
 const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),8000);
 try {
   const response=await fetch("https://gubo.com.br/docs-api/"+page,{signal:ctrl.signal,headers:{Accept:"text/html"}});
   const html=(await response.text());
   const start=html.indexOf("<main");
   const main=start>=0?html.slice(start):html;
   const text=main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
     .replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
     .replace(/&quot;/gi,'"').replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
   return res.status(200).json({status:response.status,title:html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1],content:text.slice(-18500)});
 }catch(e){return res.status(502).json({error:e?.name==="AbortError"?"timeout":"unreachable"});}
 finally{clearTimeout(t);}
};