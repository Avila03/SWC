// Teste transitório da camada centralizada de conexão Supabase da SWC.
const { dbRequest } = require("../lib/supabase-server");
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  try{
    const data=await dbRequest("swc_orders",{params:{select:"id",limit:"1"}});
    return res.status(200).json({
      configured:true,connected:Array.isArray(data),readStatus:200,recordCountNotShared:true,
      test:"swc_db_module_read_only",checkoutEnabled:false,writes:0
    });
  }catch(e){
    return res.status(502).json({
      configured:true,connected:false,
      code:typeof e?.code==="string"?e.code:"connection_failed",
      checkoutEnabled:false,writes:0
    });
  }
};