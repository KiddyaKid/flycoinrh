import {randomUUID} from 'node:crypto';
// Playwright exposeBinding is delivered to every CDP client attached to a page.
// An unrelated client can reject the callback while its real owner is signing.
// Use an intercepted, same-origin request owned by this page instead. No server
// endpoint is opened and no signing credentials enter the browser.
export async function installPageWalletChannel(page,handle,{origin='https://www.ponsfamily.com'}={}){
 const endpoint=origin+'/__flyfamily_wallet/'+randomUUID();
 await page.route(endpoint,async route=>{
  const req=route.request();
  if(req.method()!=='POST'||req.frame()!==page.mainFrame()||new URL(req.frame().url()).origin!==origin)return route.abort('accessdenied');
  let response;
  try{
   const body=req.postDataJSON();if(typeof body?.method!=='string'||!Array.isArray(body.params)||req.postData().length>65536)throw Object.assign(Error('Invalid wallet request'),{code:-32602});
   response={ok:true,result:await handle({frame:req.frame()},body.method,body.params)};
  }catch(e){response={ok:false,error:{code:Number.isInteger(e.code)?e.code:-32603,message:String(e.shortMessage??e.message??'Wallet request failed').slice(0,500)}};}
  await route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(response)}).catch(()=>{});
 });
 await page.addInitScript(({endpoint})=>{
  const send=window.fetch.bind(window);
  window.__familyRPC=async(method,params=[])=>{
   const r=await send(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params}),cache:'no-store'});
   if(!r.ok)throw Object.assign(Error('Wallet connection interrupted'),{code:4900});
   const answer=await r.json();if(!answer.ok)throw Object.assign(Error(answer.error.message),{code:answer.error.code});return answer.result;
  };
 },{endpoint});
 return endpoint;
}
