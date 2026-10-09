import React from "react";
import { createRoot } from "react-dom/client";
import { createCheckoutWorkspace, executeWorkspaceCommand, activeOrder, QUICK_CHECKOUT_DEMO_PRODUCTS } from "../../src/modules/quick-checkout/index.js";
import { QuickCheckoutPage } from "../../src/modules/quick-checkout/QuickCheckoutPage.jsx";
let workspace = createCheckoutWorkspace({storeCode:"S01",storeName:"鳳山五甲店",operator:{id:"preview",name:"介面預覽"}});
const products=QUICK_CHECKOUT_DEMO_PRODUCTS.map(p=>({...p,isPriceConfirmed:true}));
for(let i=0;i<24;i++){
 workspace=executeWorkspaceCommand(workspace,{type:"open_order"},products);
 if(i===0){
  for(const code of ["thigh_steak","thigh_steak","popcorn_chicken_small"]) workspace=executeWorkspaceCommand(workspace,{type:"order_command",command:{type:"add_product",productCode:code}},products);
 }
}
workspace={...workspace,activeOrderId:workspace.orders[0].id};
localStorage.setItem("laigdo-quick-checkout-device-v1",JSON.stringify({deviceToken:"isolated-preview-only",storeCode:"S01",storeName:"鳳山五甲店"}));
// Every API request from this fixture stays in memory.
window.fetch=async (input,options={})=>{
 const url=String(input?.url||input);
 const body=JSON.parse(options.body||"{}");
 if(url.includes("quick_checkout_load_workspace")) return new Response(JSON.stringify({workspace}),{headers:{"content-type":"application/json"}});
 if(url.includes("quick_checkout_save_workspace")){workspace=body.p_workspace;return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json"}});}
 if(url.includes("quick_checkout_clear_workspace")){workspace=null;return new Response("{}",{headers:{"content-type":"application/json"}});}
 return new Response(JSON.stringify({message:"Preview blocks external requests"}),{status:403,headers:{"content-type":"application/json"}});
};
createRoot(document.getElementById("root")).render(<QuickCheckoutPage />);
