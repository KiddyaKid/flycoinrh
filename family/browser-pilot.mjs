// A real PONS form and an upstream neural cursor. No key and no broadcasting.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {provider} from './lib/pons.mjs';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'build/external-pilot'),owner='0x9cA6276184A59d23Ef97e1CD06c02C4A6Af3322C';
const birth=JSON.parse(readFileSync(resolve(dir,'pilot.json'))),chain=JSON.parse(readFileSync(resolve(import.meta.dirname,'chain.json'))),rpc=provider(chain.rpcUrl);
if(birth.status!=='awaiting-signature'||birth.hash)throw Error('PILOT_NOT_READY');
mkdirSync(dir,{recursive:true});let browser,brain,answer,streaming=false,requested=false,x=640,y=500;
const state={status:'opening',asOf:new Date().toISOString(),url:'',log:[],cursor:null,transactionRequested:false};
function save(){state.asOf=new Date().toISOString();writeFileSync(resolve(dir,'browser-state.tmp'),JSON.stringify(state));renameSync(resolve(dir,'browser-state.tmp'),resolve(dir,'browser-state.json'));}
function note(message){state.log.push({time:new Date().toISOString(),message});state.log=state.log.slice(-30);save();console.log(message);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 browser=await chromium.launchPersistentContext(resolve(dir,'browser-profile'),{channel:'chrome',headless:false,viewport:{width:1280,height:720}});const page=await browser.newPage();
 page.on('popup',p=>p.close());page.on('download',d=>d.cancel());
 const reads=new Set(['eth_call','eth_getBalance','eth_getCode','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getTransactionCount','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory']);
 await page.exposeBinding('__familyRPC',async({frame},method,params=[])=>{
  if(new URL(frame.url()).origin!=='https://www.ponsfamily.com')throw Error('ORIGIN_DENIED');
  if(method==='eth_sendTransaction'){
   if(requested)throw Error('ONE_REQUEST_ONLY');requested=true;
   writeFileSync(resolve(dir,'browser-request.json'),JSON.stringify({birthId:birth.id,requestedAt:new Date().toISOString(),source:'pons-page-eth_sendTransaction',url:frame.url(),tx:params[0],cursor:state.cursor},null,2));
   state.transactionRequested=true;state.status='request-captured';note('PONS page requested a transaction. No signature or broadcast in this rehearsal.');throw Error('FLYFAMILY_REHEARSAL_NO_SIGNATURE');
  }
  if(!reads.has(method))throw Error('UNSUPPORTED_WALLET_METHOD');return rpc.send(method,params);
 });
 await page.addInitScript(({owner})=>{
  const events={};const emit=(k,...a)=>(events[k]??[]).forEach(f=>f(...a));
  const p={isFlyfamily:true,isMetaMask:true,chainId:'0x1237',selectedAddress:owner,
   async request({method,params=[]}){if(['eth_accounts','eth_requestAccounts'].includes(method)){emit('accountsChanged',[owner]);return [owner];}if(method==='eth_chainId')return '0x1237';if(method==='net_version')return '4663';if(method==='wallet_switchEthereumChain'){if(params[0]?.chainId!=='0x1237')throw Error('WRONG_CHAIN');return null;}if(['wallet_requestPermissions','wallet_getPermissions'].includes(method))return [{parentCapability:'eth_accounts'}];return window.__familyRPC(method,params);},
   on(k,f){(events[k]??=[]).push(f);return p;},removeListener(k,f){events[k]=(events[k]??[]).filter(v=>v!==f);return p;},isConnected:()=>true};
  Object.defineProperty(window,'ethereum',{value:p,configurable:true});
  const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'c9f991aa-489b-4f80-b9ee-1949d88061dd',name:'FLYFAMILY Test',rdns:'live.flyfamily',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'},provider:p}}));window.addEventListener('eip6963:requestProvider',announce);announce();
 },{owner});
 await page.goto('https://www.ponsfamily.com/launchpad/create',{waitUntil:'domcontentloaded'});state.url=page.url();
 streaming=true;const stream=(async()=>{while(streaming){try{const jpg=await page.screenshot({type:'jpeg',quality:55});writeFileSync(resolve(dir,'browser-frame.tmp'),jpg);renameSync(resolve(dir,'browser-frame.tmp'),resolve(dir,'browser-frame.jpg'));save();}catch{}await wait(500);}})();
 await page.getByRole('textbox',{name:'Name',exact:true}).waitFor({timeout:30000});
 note('Real PONS form open. Wallet exposes only the test address and read-only RPC.');
 // The operator handles personal terms / jurisdiction attestations in this window.
 if(await page.getByRole('dialog').count()){state.status='operator-terms';note('Please review any PONS terms in the browser. The rig does not attest on your behalf.');await page.getByRole('dialog').waitFor({state:'hidden',timeout:300000});}
 await page.getByRole('textbox',{name:'Name',exact:true}).fill(birth.name);
 await page.getByRole('textbox',{name:'Ticker',exact:true}).fill(birth.symbol);
 await page.getByRole('textbox',{name:'Description',exact:true}).fill(birth.prepared.params.description);
 await page.getByRole('textbox',{name:'X profile handle',exact:true}).fill('flyfamilyrh');
 await page.locator('input[type="file"]').setInputFiles(resolve(root,'assets/flyfamily-logo.jpg'));
 note('Host filled the measured name, fixed image and @flyfamilyrh. Developer buy remains zero.');
 const connect=page.getByRole('button',{name:'Connect wallet',exact:true});
 if(await connect.count()){await connect.click();const choice=page.getByText('FLYFAMILY Test',{exact:true});await choice.waitFor({timeout:15000});await choice.click();}
 await wait(2500);
 const terms=page.getByText('Review and accept',{exact:true});
 if(await terms.isVisible()){state.status='operator-terms';note('PONS requires personal terms acceptance. Waiting in this browser; no key or transaction required.');await terms.waitFor({state:'hidden',timeout:600000});}
 writeFileSync(resolve(dir,'browser-ui.txt'),await page.locator('body').innerText());
 // Select a visible launch control, never a coordinate inferred from an old frame.
 const launch=page.getByRole('button',{name:/^(Launch token|Launch|Create token|Create)(\s|$)/i}).last();
 await launch.waitFor({timeout:20000});await launch.scrollIntoViewIfNeeded();if(!await launch.isEnabled())throw Error('LAUNCH_BUTTON_DISABLED');
 await page.evaluate(()=>{const e=document.createElement('div');e.id='family-cursor';e.style.cssText='position:fixed;width:34px;height:34px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 0 4px white)';e.textContent='🪰';e.style.fontSize='30px';document.body.append(e);});
 brain=spawn(process.env.FAMILY_PYTHON,[resolve(import.meta.dirname,'cursor.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 createInterface({input:brain.stdout}).on('line',line=>{if(answer){const a=answer;answer=null;try{const r=JSON.parse(line);r.error?a.reject(Error('CURSOR_MODEL_ERROR')):a.resolve(r);}catch{a.reject(Error('CURSOR_PROTOCOL_ERROR'));}}});brain.stderr.on('data',()=>{});brain.on('exit',()=>answer?.reject(Error('CURSOR_EXIT')));
 const box=await launch.boundingBox();x=box.x+box.width/2;y=Math.min(690,box.y+box.height+35);note('Host positioned the cursor below the launch control. Neural movement and DNp09 stopping now determine whether it clicks.');
 state.status='neural-cursor';
 for(let i=0;i<120&&!requested;i++){
  await page.locator('#family-cursor').evaluate((e,p)=>{e.style.left=p.x+'px';e.style.top=p.y+'px';},{x,y});
  const frame=resolve(dir,'cursor-input.jpg');await page.screenshot({path:frame,type:'jpeg',quality:65});
  const r=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CURSOR_TIMEOUT')),90000);answer={resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}};brain.stdin.write(JSON.stringify({id:String(i),frame,x,y,seed:17+i,gain:1})+'\n');});
  x=Math.max(2,Math.min(1278,x+r.dx));y=Math.max(2,Math.min(718,y+r.dy));await page.mouse.move(x,y);
  const b=await launch.boundingBox(),hit=Boolean(b&&x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height&&r.click);
  state.cursor={...r,x,y,hit,step:i};save();writeFileSync(resolve(dir,'cursor-steps.jsonl'),JSON.stringify(state.cursor)+'\n',{flag:'a'});
  if(hit){note('Neural cursor hit the enabled launch button; sending a real mouse click.');await page.mouse.click(x,y);await wait(3000);}
 }
 if(!requested){state.status='no-neural-click';note('No eligible neural click in 120 steps. No fallback click; nothing signed.');}
 await wait(30000);streaming=false;await stream;
}catch(e){state.status='paused';note('Browser pilot paused: '+e.message.slice(0,500));}
finally{streaming=false;brain?.kill();await browser?.close();rpc.destroy();}


