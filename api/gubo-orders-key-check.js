// Endpoint temporário para confirmar escopos de leitura da nova chave Gubo.
// Não recebe dados do usuário, não grava pedidos nem retorna dados de clientes.
const BASE = "https://api.gubo.com.br/v1";
const SCOPES = ["pedidos:ler","pedidos:criar","pedidos:pagar","pedidos:cancelar","catalogo:ler","vinculos:ler","fretes:ler"];
async function get(path,key) {
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),6500);
  try {
    const r=await fetch(BASE+path,{
      method:"GET",
      headers:{Authorization:"Bearer "+key,Accept:"application/json"},
      cache:"no-store",redirect:"error",signal:ac.signal
    });
    // Only inspect test result in server memory, no order/customer details returned.
    const body=await r.json().catch(()=>({}));
    return {status:r.status,body};
  }finally{clearTimeout(timer)}
}
module.exports = async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"method_not_allowed"});}
  const key=process.env.GUBO_ORDERS_API_KEY;
  if(!key) return res.status(503).json({configured:false,error:"missing_orders_key"});
  if(!key.startsWith("gubo_test_"))return res.status(503).json({configured:true,error:"test_key_required"});
  try{
    const connection=await get("/conexao",key);
    const orders=await get("/pedidos?limite=1",key);
    const keyMeta=connection.body?.chave || {};
    const metadata=JSON.stringify(keyMeta);
    const scopes=SCOPES.filter(scope=>metadata.includes(scope));
    return res.status(200).json({
      configured:true,
      mode:"test",
      authStatus:connection.status,
      connectionMode:connection.status===200 ? connection.body?.modo||null:null,
      ordersReadStatus:orders.status,
      ordersReadAllowed:orders.status===200,
      ordersErrorCode:orders.status===200?null:orders.body?.erro?.codigo||null,
      grantedScopes:scopes,
      // Always suppress order bodies, customer details and credential data.
      createdOrders:0,
      performedWrites:false
    });
  }catch(e){return res.status(502).json({configured:true,error:e?.name==="AbortError"?"timeout":"upstream_failed"});}
};