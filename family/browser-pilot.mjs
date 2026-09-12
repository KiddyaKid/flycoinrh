// A real PONS form and an upstream neural cursor. No key and no broadcasting.
import {chromium} from 'playwright';
import {captureBrowser} from './lib/live-camera.mjs';
import {moveDecodedCursor} from './lib/cursor-motion.mjs';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {provider} from './lib/pons.mjs';
const root=resolve(import.meta.dirname,'..'),dir=resolve(process.env.FAMILY_PILOT_DIR??resolve(root,'build/external-pilot')),owner='0x9cA6276184A59d23Ef97e1CD06c02C4A6Af3322C';
const birth=JSON.parse(readFileSync(resolve(dir,'pilot.json'))),chain=JSON.parse(readFileSync(resolve(import.meta.dirname,'chain.json'))),rpc=provider(chain.rpcUrl);
const rehearse=process.env.FAMILY_REHEARSAL==='1';
if(birth.status!=='awaiting-signature'||birth.hash)throw Error('PILOT_NOT_READY');
mkdirSync(dir,{recursive:true});let browser,pilotPage,sharedBrowser=false,brain,answer,stopCapture,lastJpg=null,streaming=false,requested=false,x=640,y=500;
const state={status:'opening',asOf:new Date().toISOString(),url:'',log:[],cursor:null,transactionRequested:false,hitCount:0};
function save(){state.asOf=new Date().toISOString();writeFileSync(resolve(dir,'browser-state.tmp'),JSON.stringify(state));try{renameSync(resolve(dir,'browser-state.tmp'),resolve(dir,'browser-state.json'));}catch(e){if(!['EPERM','EACCES','ENOENT'].includes(e.code))throw e;}}
function note(message){state.log.push({time:new Date().toISOString(),message});state.log=state.log.slice(-30);save();console.log(message);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 if(process.env.FAMILY_BROWSER_CDP){if(process.env.FAMILY_BROWSER_CDP!=='http://127.0.0.1:5192')throw Error('INVALID_BROWSER_ENDPOINT');browser=await chromium.connectOverCDP(process.env.FAMILY_BROWSER_CDP);sharedBrowser=true;pilotPage=await browser.contexts()[0].newPage();}else{browser=await chromium.launchPersistentContext(resolve(root,'build/external-pilot/browser-profile'),{channel:'chrome',headless:true,locale:'en-US',viewport:{width:1280,height:720}});pilotPage=await browser.newPage();}const page=pilotPage;await page.setExtraHTTPHeaders({'Accept-Language':'en-US,en;q=0.9'});
 page.on('popup',p=>p.close());page.on('download',d=>d.cancel());
 page.on('pageerror',e=>note('Page error: '+e.message.slice(0,300)));
 const reads=new Set(['eth_call','eth_getBalance','eth_getCode','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getTransactionCount','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory']);
 await page.exposeBinding('__familyRPC',async({frame},method,params=[])=>{
  if(new URL(frame.url()).origin!=='https://www.ponsfamily.com')throw Error('ORIGIN_DENIED');
  if(method==='eth_sendTransaction'){
   if(requested)throw Error('ONE_REQUEST_ONLY');requested=true;
   const request={birthId:birth.id,requestedAt:new Date().toISOString(),source:'pons-page-eth_sendTransaction',url:frame.url(),tx:params[0],cursor:state.cursor};request.digest=createHash('sha256').update(JSON.stringify(request.tx)).digest('hex');
   writeFileSync(resolve(dir,rehearse?'rehearsal-request.json':'browser-request.json'),JSON.stringify(request,null,2));
   if(rehearse){state.transactionRequested=true;state.status='rehearsal-complete';note('Verified actual PONS wallet request. Unsigned rehearsal; no transaction broadcast.');throw Object.assign(Error('Unsigned rehearsal complete'),{code:4001});}
   state.transactionRequested=true;state.status='awaiting-local-signature';note('PONS page requested a transaction. Waiting for the separate local wallet; the browser has no key.');
   for(let n=0;n<600;n++){const file=resolve(dir,'browser-result.json');if(existsSync(file)){const result=JSON.parse(readFileSync(file));if(result.digest===request.digest&&result.birthId===birth.id&&/^0x[a-fA-F0-9]{64}$/.test(result.hash)){state.status='submitted';state.hash=result.hash;save();return result.hash;}}await wait(1000);}throw Error('LOCAL_SIGNATURE_TIMEOUT');
  }
  if(!reads.has(method)){note('Wallet method awaiting implementation: '+method);throw Error('UNSUPPORTED_WALLET_METHOD');}return rpc.send(method,params);
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
 stopCapture=await captureBrowser(page,jpg=>{lastJpg=jpg;try{writeFileSync(resolve(dir,'browser-frame.tmp'),jpg);renameSync(resolve(dir,'browser-frame.tmp'),resolve(dir,'browser-frame.jpg'));}catch(e){if(!['EPERM','EACCES','ENOENT'].includes(e.code))throw e;}});
 streaming=true;const stream=(async()=>{while(streaming){try{const jpg=lastJpg??await page.screenshot({type:'jpeg',quality:55});writeFileSync(resolve(dir,'browser-frame.tmp'),jpg);renameSync(resolve(dir,'browser-frame.tmp'),resolve(dir,'browser-frame.jpg'));save();}catch{}await wait(500);}})();
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
 const dark=page.getByRole('button',{name:'Switch to dark mode',exact:true});if(await dark.isVisible())await dark.click();
 writeFileSync(resolve(dir,'browser-ui.txt'),await page.locator('body').innerText());
 // Select a visible launch control, never a coordinate inferred from an old frame.
 let launch=page.getByRole('button',{name:/^(Launch token|Launch|Create token|Create)(\s|$)/i}).last();
 await launch.waitFor({timeout:20000});await launch.scrollIntoViewIfNeeded();if(!await launch.isEnabled())throw Error('LAUNCH_BUTTON_DISABLED');
 await page.evaluate(()=>{const e=document.createElement('div');e.id='family-cursor';e.style.cssText='position:fixed;width:34px;height:34px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 0 4px white)';e.textContent='🪰';e.style.fontSize='30px';document.body.append(e);});
 brain=spawn(process.env.FAMILY_PYTHON,[resolve(import.meta.dirname,'cursor.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 createInterface({input:brain.stdout}).on('line',line=>{if(answer){const a=answer;answer=null;try{const r=JSON.parse(line);r.error?a.reject(Error('CURSOR_MODEL_ERROR')):a.resolve(r);}catch{a.reject(Error('CURSOR_PROTOCOL_ERROR'));}}});brain.stderr.on('data',()=>{});brain.on('exit',()=>answer?.reject(Error('CURSOR_EXIT')));
 const box=await launch.boundingBox();x=box.x+box.width/2;y=box.y+box.height/2;note('Assisted target selection: host confines the cursor to Launch. Displacement uses the upstream 12 ms decoder; the DNp09 stop threshold is still required for a click.');
 state.status='neural-cursor';
 for(let i=0;i<120&&!requested;i++){
  await page.locator('#family-cursor').evaluate((e,p)=>{e.style.left=p.x+'px';e.style.top=p.y+'px';},{x,y});
  const frame=resolve(dir,'cursor-input.jpg');if(lastJpg)writeFileSync(frame,lastJpg);else await page.screenshot({path:frame,type:'jpeg',quality:65});const stepStarted=Date.now();
  const r=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CURSOR_TIMEOUT')),90000);answer={resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}};brain.stdin.write(JSON.stringify({id:String(i),frame,x,y,seed:17+i,gain:1})+'\n');});
  const b=await launch.boundingBox();if(!b||!await launch.isEnabled())throw Error('LAUNCH_CONTROL_CHANGED');
  const from={x,y};const inset=Math.min(b.height/2,b.width/4);x=Math.max(b.x+inset,Math.min(b.x+b.width-inset,x+r.dx));y=Math.max(b.y+8,Math.min(b.y+b.height-8,y+r.dy));await moveDecodedCursor(page,from,{x,y},600);
  const onTarget=await launch.evaluate((button,p)=>{const e=document.elementFromPoint(p.x,p.y);return e===button||button.contains(e);},{x,y});
  const hit=Boolean(r.click&&onTarget);
  state.cursor={...r,x,y,hit,computeMs:Date.now()-stepStarted,step:i,assistance:'DOM target selection and boundary clamp; neural displacement and stop gate'};save();writeFileSync(resolve(dir,'cursor-steps.jsonl'),JSON.stringify(state.cursor)+'\n',{flag:'a'});
  if(hit){
   state.hitCount++;note('Neural cursor hit the enabled '+(state.confirming?'confirmation':'launch')+' button; sending a real mouse click.');await page.mouse.click(x,y);await wait(3000);
   const body=await page.locator('body').innerText();writeFileSync(resolve(dir,'after-click.txt'),body);
   const invalid=await page.locator('input:invalid,textarea:invalid').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label')??e.placeholder,message:e.validationMessage})));if(invalid.length){note('Form validation: '+JSON.stringify(invalid));break;}
   const confirm=page.getByRole('button',{name:'Confirm',exact:true});
   if(!requested&&!state.confirming&&await confirm.isVisible()){
    if(!body.includes(birth.name)||!body.includes('Launch '+birth.symbol))throw Error('CONFIRMATION_METADATA_CHANGED');
    launch=confirm;const c=await launch.boundingBox();x=c.x+c.width/2;y=c.y+c.height/2;state.confirming=true;note('PONS review dialog opened. Host retargeted Confirm; waiting for another neural stop event.');
   }
   if(!requested&&state.hitCount>=6)break;
  }
 }
 if(!requested){state.status=state.hitCount?'no-wallet-request':'no-neural-click';note(state.hitCount?'Neural clicks occurred but no wallet request. Inspect after-click.txt.':'No eligible neural click in 120 steps. No fallback click; nothing signed.');}
 if(requested){for(let n=0;n<600&&state.status==='awaiting-local-signature';n++)await wait(1000);}
 await wait(30000);streaming=false;await stream;
}catch(e){state.status='paused';note('Browser pilot paused: '+e.message.slice(0,500));}
finally{streaming=false;await stopCapture?.();brain?.kill();if(sharedBrowser)await pilotPage?.close();await browser?.close();rpc.destroy();}


