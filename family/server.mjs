// One process owns the browser, confirmed-chain cursor and durable birth queue.
// Public HTTP is read-only. Signing is opt-in, never reachable from browser input.
import {createServer} from 'node:http';
import {installObserverWallet,connectObserverWallet} from './lib/observer-wallet.mjs';
import {browserRoam,EXPLORE_URL,allowedFieldUrl} from './lib/field-study.mjs';
import {boundFieldSnapshot} from './lib/field-payload.mjs';
import {collectLiveSwaps} from './lib/live-swaps.mjs';
import {dossierStore} from './lib/tx-dossiers.mjs';
import {runLane} from './lib/live-loop.mjs';
import {videoServer,captureBrowser} from './lib/live-camera.mjs';
import {bindLiveAllowance} from './lib/live-authorization.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {chromium} from 'playwright';
import {Contract,Interface,getAddress,keccak256} from 'ethers';
import {provider,CURVE_ABI} from './lib/pons.mjs';
import {prepareOffspring,verifyOffspring} from './lib/offspring-deploy.mjs';
import {readPilotView} from './lib/pilot-view.mjs';
import {tradeIdentity,volumeSurge,nextEgg,canStartEgg,publicBirth,MAX_PENDING,VERSION,X_URL,LOGO_URL} from './policy.mjs';
const root=resolve(import.meta.dirname,'..'),folder=resolve(process.env.FAMILY_STATE_DIR??resolve(root,'build/family'));
mkdirSync(folder,{recursive:true});
const lockPath=resolve(folder,'process.lock'),lock=openSync(lockPath,'wx');writeFileSync(lock,String(process.pid));
const chain=JSON.parse(readFileSync(resolve(import.meta.dirname,'chain.json'),'utf8'));
const inputPools=JSON.parse(readFileSync(resolve(import.meta.dirname,'live-input-pools.json'),'utf8'));
const owner=getAddress(process.env.FAMILY_OPERATOR_ADDRESS??'0x9ca6276184a59d23ef97e1cd06c02c4a6af3322c');
const rpc=provider(process.env.FAMILY_RPC??chain.rpcUrl),abi=new Interface(CURVE_ABI);
const db=new DatabaseSync(resolve(folder,'ledger.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT); CREATE TABLE IF NOT EXISTS trades(id TEXT PRIMARY KEY,payload TEXT); CREATE TABLE IF NOT EXISTS triggers(id TEXT PRIMARY KEY,payload TEXT,status TEXT); CREATE TABLE IF NOT EXISTS births(id TEXT PRIMARY KEY,payload TEXT);');
const dossiers=dossierStore(db);
const get=k=>{const r=db.prepare('SELECT v FROM meta WHERE k=?').get(k);return r?JSON.parse(r.v):null;};
const put=(k,v)=>db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,JSON.stringify(v));
const births=()=>db.prepare('SELECT payload FROM births ORDER BY rowid').all().map(r=>JSON.parse(r.payload));
const save=b=>db.prepare('INSERT INTO births VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(b.id,JSON.stringify(b));
if(!get('runId'))put('runId',crypto.randomUUID());
let running=true,browser,page,jpg=null,frameAt=null,neural=null,cameraError=null,observerError=null,revision=get('revision')??0;
let worker=null,answer=null,stopCapture,scan=null,unconfirmed=[],processing=null,brainBusy=false,loopTimes={},idleControl=null,observerWallet={status:'disconnected',owner,signing:'paused'},lastWalletCheck=0;
const stamp=()=>new Date().toISOString();
function hlsUrl(){try{const s=JSON.parse(readFileSync(resolve(folder,'hls-status.json'),'utf8'));return s.status==='publishing'&&Date.now()-Date.parse(s.publishedAt)<15000&&s.url==='https://live.flyfamily.live/index.m3u8'?s.url:null;}catch{return null;}}
function videoUrl(){try{const u=new URL(readFileSync(resolve(folder,'video-origin.txt'),'utf8').trim());return u.protocol==='https:'&&u.hostname.endsWith('.trycloudflare.com')?new URL('/video.mjpeg',u).href:null;}catch{return null;}}
db.exec('CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL, hash TEXT)');
function journal(kind,detail,hash=null){db.prepare('INSERT INTO journal(at,kind,detail,hash) VALUES(?,?,?,?)').run(stamp(),kind,detail,hash);}
function job(stage,detail,hash=null){processing={stage,detail,hash,asOf:stamp()};journal(stage,detail,hash);}
function startBrain(){
 if(!process.env.FAMILY_GRAPH||!process.env.FAMILY_GRAPH_SHA256||!process.env.FAMILY_ANNOTATIONS){cameraError='Brain data not configured';return;}
 worker=spawn(process.env.FAMILY_PYTHON??'python',[resolve(import.meta.dirname,'brain.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 createInterface({input:worker.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(answer){const a=answer;answer=null;r.error?a.reject(Error('BRAIN_MEASUREMENT_FAILED')):a.resolve(r);}}catch{}});
 worker.stderr.on('data',()=>{cameraError='Brain worker requires attention';});
 worker.on('error',()=>{cameraError='Brain worker unavailable';});
 worker.on('exit',()=>{worker=null;if(answer){answer.reject(Error('BRAIN_WORKER_STOPPED'));answer=null;}});
}
db.exec('CREATE TABLE IF NOT EXISTS field_observations(id TEXT PRIMARY KEY, at TEXT NOT NULL, payload TEXT NOT NULL)');
function rememberObservation(r){
 if(!r.vision)return;
 const entry={id:r.id,asOf:stamp(),kind:r.kind,windowMs:r.windowMs,graphSha256:r.graphSha256,vision:{...r.vision,on:undefined,off:undefined},parents:r.parents.map(p=>({id:p.id,seed:p.seed,active:p.active,rates:p.rates,baseline:p.baseline,delta:p.delta}))};
 const history=get('fieldObservations')??[];put('fieldObservations',[entry,...history.filter(e=>e.vision?.url!==entry.vision.url||e.vision?.target!==entry.vision.target||e.kind!==entry.kind)].slice(0,12));
 db.prepare('INSERT OR IGNORE INTO field_observations(id,at,payload) VALUES(?,?,?)').run(entry.id,entry.asOf,JSON.stringify({...entry,vision:{...entry.vision,crop:undefined,scene:undefined}}));
 const text=`${r.vision.target} | ${r.parents.map(p=>`${p.id.toUpperCase()}: ${p.active.toLocaleString('en-US')} active, pC1 ${p.rates.courtship.toFixed(1)} Hz`).join(' | ')} | ${r.windowMs} ms sample`;
 void page.evaluate(text=>{window.dispatchEvent(new CustomEvent('family-result',{detail:{text}}));const el=document.getElementById('family-study-hud');if(el)el.textContent=text;},text).catch(()=>{});
}
async function think(kind,matched=false){
 if(!worker||!jpg)throw Error('BRAIN_OR_FRAME_UNAVAILABLE');
 for(let n=0;n<60&&['moving','opening'].includes(idleControl?.status);n++)await new Promise(r=>setTimeout(r,50));
 if(['moving','opening'].includes(idleControl?.status))throw Error('FIELD_CAPTURE_PENDING');
 const gaze=await page.evaluate(()=>{const e=document.getElementById('family-cursor');return {x:e?parseFloat(e.style.left):640,y:e?parseFloat(e.style.top):360};});
 const path=resolve(folder,'brain-frame.jpg');
 const captured=await page.screenshot({type:'jpeg',quality:70,style:'#family-cursor,#family-gaze,#family-study-hud{visibility:hidden!important}'});
 const observation={...gaze,capturedAt:stamp(),url:page.url(),task:idleControl?.task?.title??'Browser observation',target:idleControl?.task?.target??'Page center'};
 writeFileSync(path,captured);const id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{answer=null;worker?.kill();reject(Error('BRAIN_TIMEOUT'));},120000);answer={resolve:r=>{clearTimeout(timer);try{rememberObservation(r);resolve(r);}catch(e){reject(e);}},reject:e=>{clearTimeout(timer);reject(e);}};worker.stdin.write(JSON.stringify({id,frame:path,kind,matched,observation})+'\n');});
}
function snapshot(){const all=births(),pilot=readPilotView(root);if(pilot&&!all.some(b=>b.id===pilot.birth.id))all.push(pilot.birth);const stored=db.prepare('SELECT payload FROM trades ORDER BY rowid DESC LIMIT 30').all().map(r=>JSON.parse(r.payload)),records=[...new Map([...(pilot?[pilot.record]:[]),...stored].map(r=>[r.id,r])).values()].sort((a,b)=>b.timestamp-a.timestamp).slice(0,30);return boundFieldSnapshot({schema:'flyfamily.live.v1',ruleVersion:VERSION,runId:get('runId'),revision,asOf:new Date().toISOString(),status:observerError?'unavailable':'watching',observerError,camera:pilot?.camera??{status:frameAt&&Date.now()-Date.parse(frameAt)<15000?'live':'offline',asOf:frameAt,url:page?.url()??null,error:cameraError},frame:pilot?.frame??(jpg?'data:image/jpeg;base64,'+jpg.toString('base64'):null),browserControl:pilot?.browserControl??idleControl,observerWallet,neural,observations:get('fieldObservations')??[],births:all.slice(-100).map(publicBirth),offspringCount:all.filter(b=>b.status==='confirmed'&&b.receiptVerified===true).length,queueDepth:db.prepare("SELECT count(*) n FROM triggers WHERE status='queued'").get().n,dossierCounts:dossiers.counts(),measuredRecords:dossiers.recent(),records:records.map(t=>({...t,dossier:dossiers.get(t.id),processing:db.prepare('SELECT status FROM triggers WHERE id=?').get(t.id)?.status??'historical'})),recordCount:db.prepare('SELECT count(*) n FROM trades').get().n,journal:db.prepare('SELECT * FROM journal ORDER BY id DESC LIMIT 60').all(),scan,unconfirmed,processing,loopTimes,videoUrl:videoUrl(),hlsUrl:hlsUrl(),execution:{mode:process.env.FAMILY_OBSERVE_ONLY==='1'?'observation-only':'bounded-live-test',reason:process.env.FAMILY_OBSERVE_ONLY==='1'?'Signing paused; live observation continues':'One additional live child; cumulative budget 0.02 ETH'},cursor:get('cursor'),social:X_URL,logo:LOGO_URL});}
let lastPublish=null,publishedBytes=0,videoMetrics=()=>({});
let publisher=null;try{publisher=JSON.parse(readFileSync(process.env.FAMILY_PUBLISH_FILE,'utf8'));}catch{}
async function publish(){revision++;put('revision',revision);const s=snapshot();writeFileSync(resolve(folder,'snapshot.tmp'),JSON.stringify(s));renameSync(resolve(folder,'snapshot.tmp'),resolve(folder,'snapshot.json'));if(publisher){const u=new URL('/api/family',publisher.endpoint);const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-Fruit-Ingest-Key':publisher.ingestKey},body:JSON.stringify(s),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('PUBLICATION_FAILED_'+r.status);}lastPublish=stamp();publishedBytes=Buffer.byteLength(JSON.stringify(s));}
function enqueue(e){const count=db.prepare("SELECT count(*) n FROM triggers WHERE status='queued'").get().n;db.prepare('INSERT OR IGNORE INTO triggers VALUES(?,?,?)').run(e.id,JSON.stringify(e),count<MAX_PENDING?'queued':'capacity');}
async function collect(){
 if(Number((await rpc.getNetwork()).chainId)!==chain.chainId)throw Error('WRONG_CHAIN');
 const started=Date.now(),top=await rpc.getBlock('latest'),head=await rpc.getBlock(top.number-20);
 scan={...scan,startedAt:stamp(),checkingHead:top.number,confirmations:20,token:chain.token,intervalMs:3000};
 if(Date.now()-head.timestamp*1000>180000)throw Error('STALE_CHAIN');
 const provisional=await rpc.getLogs({address:chain.curve,fromBlock:head.number+1,toBlock:top.number,topics:[[abi.getEvent('CurveBuy').topicHash,abi.getEvent('CurveSell').topicHash]]});
 unconfirmed=provisional.filter(l=>!l.removed).slice(-10).map(l=>{const e=abi.parseLog(l),kind=e.name==='CurveBuy'?'buy':'sell';return {id:l.transactionHash+':'+l.index,hash:l.transactionHash,block:l.blockNumber,kind,confirmations:top.number-l.blockNumber,requiredConfirmations:20,quoteWei:String(kind==='buy'?e.args.quoteIn:e.args.quoteOut)};});
 for(const k of ['token','curve','factory'])if(keccak256(await rpc.getCode(chain[k],head.number))!==chain[k+'CodeHash'])throw Error('CODE_CHANGED');
 if(await new Contract(chain.curve,['function graduated() view returns(bool)'],rpc).graduated({blockTag:head.number}))throw Error('POOL_ADAPTER_REQUIRED_AFTER_GRADUATION');
 let cursor=get('cursor');if(!get('historyImported')){
  // Import known founder-token receipts as history only; never enqueue them.
  for(const hash of chain.recordedTradeHashes??[]){const receipt=await rpc.getTransactionReceipt(hash);if(receipt?.status!==1||receipt.blockNumber>head.number||(await rpc.getBlock(receipt.blockNumber))?.hash!==receipt.blockHash)throw Error('HISTORICAL_RECEIPT_INVALID');for(const l of receipt.logs){if(l.address.toLowerCase()!==chain.curve.toLowerCase())continue;let e;try{e=abi.parseLog(l);}catch{continue;}if(!['CurveBuy','CurveSell'].includes(e?.name))continue;const block=await rpc.getBlock(l.blockNumber),kind=e.name==='CurveBuy'?'buy':'sell',t={hash,index:l.index,kind,quoteWei:String(kind==='buy'?e.args.quoteIn:e.args.quoteOut),timestamp:block.timestamp*1000,block:l.blockNumber,blockHash:block.hash,historical:true};t.id=tradeIdentity(t);db.prepare('INSERT OR IGNORE INTO trades VALUES(?,?)').run(t.id,JSON.stringify(t));}}
  put('historyImported',true);}
 if(!cursor){put('cursor',{number:head.number,hash:head.hash});return;}

 if((await rpc.getBlock(cursor.number))?.hash!==cursor.hash)throw Error('CHAIN_REORGANIZED');
 const to=Math.min(head.number,cursor.number+1500);if(to<=cursor.number){scan={...scan,completedAt:stamp(),head:top.number,safeHead:head.number,scannedThrough:cursor.number,lagBlocks:head.number-cursor.number,durationMs:Date.now()-started};return;}
 const logs=await rpc.getLogs({address:chain.curve,fromBlock:cursor.number+1,toBlock:to,topics:[[abi.getEvent('CurveBuy').topicHash,abi.getEvent('CurveSell').topicHash]]});const rows=[];
 for(const log of logs.sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index)){
  const [receipt,block]=await Promise.all([rpc.getTransactionReceipt(log.transactionHash),rpc.getBlock(log.blockNumber)]);
  if(log.removed||receipt?.status!==1||receipt.blockHash!==block.hash||log.blockHash!==block.hash||!receipt.logs.some(l=>l.index===log.index&&l.address.toLowerCase()===chain.curve.toLowerCase()&&l.data===log.data&&JSON.stringify(l.topics)===JSON.stringify(log.topics)))throw Error('UNVERIFIED_TRADE');
  const e=abi.parseLog(log),kind=e.name==='CurveBuy'?'buy':'sell',t={hash:log.transactionHash,index:log.index,kind,quoteWei:String(kind==='buy'?e.args.quoteIn:e.args.quoteOut),timestamp:block.timestamp*1000,block:log.blockNumber,blockHash:block.hash};t.id=tradeIdentity(t);rows.push(t);
 }
 const end=await rpc.getBlock(to);if((await rpc.getBlock(head.number))?.hash!==head.hash)throw Error('CHAIN_REORGANIZED');
 db.exec('BEGIN IMMEDIATE');try{for(const t of rows){const inserted=db.prepare('INSERT OR IGNORE INTO trades VALUES(?,?)').run(t.id,JSON.stringify(t));if(inserted.changes){enqueue(t);dossiers.enqueue(t);journal('trade-confirmed',t.kind.toUpperCase()+' · block '+t.block,t.hash);}}put('cursor',{number:to,hash:end.hash});const recent=db.prepare('SELECT payload FROM trades ORDER BY rowid DESC LIMIT 3000').all().map(r=>JSON.parse(r.payload));const surge=volumeSurge(recent,head.timestamp*1000);if(surge)enqueue(surge);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 scan={...scan,completedAt:stamp(),head:top.number,safeHead:head.number,scannedThrough:to,lagBlocks:head.number-to,durationMs:Date.now()-started};
}
async function collectExternal(){
 scan=await collectLiveSwaps({rpc,config:inputPools,getCursor:()=>get('externalCursor:'+inputPools.token),commit:(rows,cursor)=>{
  db.exec('BEGIN IMMEDIATE');try{
   for(const t of rows){const result=db.prepare('INSERT OR IGNORE INTO trades VALUES(?,?)').run(t.id,JSON.stringify(t));
    if(result.changes&&!t.historical){enqueue(t);dossiers.enqueue(t);journal('trade-confirmed',t.kind.toUpperCase()+' / '+t.quoteSymbol+' · block '+t.block,t.hash);}}
   put('externalCursor:'+inputPools.token,cursor);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }});unconfirmed=[];
}
async function accountedSpend(){
 let prior={};try{prior=JSON.parse(readFileSync(process.env.FAMILY_PRIOR_TX_FILE,'utf8'));}catch{throw Error('PRIOR_SPEND_RECONCILIATION_REQUIRED');}
 const hashes=[chain.launchHash,prior.sweepHash,prior.claimHash,...births().map(b=>b.hash)].filter(Boolean),nonces=new Set();let spent=0n;
 for(const h of new Set(hashes)){const r=await rpc.getTransactionReceipt(h),t=await rpc.getTransaction(h);if(!r||!t||t.from!==owner||(await rpc.getBlock(r.blockNumber))?.hash!==r.blockHash)throw Error('UNRESOLVED_WALLET_TX');spent+=r.gasUsed*r.gasPrice+(r.status===1?t.value:0n);nonces.add(t.nonce);}
 const pending=await rpc.getTransactionCount(owner,'pending'),latest=await rpc.getTransactionCount(owner,'latest');if(pending!==latest||latest!==nonces.size||[...nonces].some(n=>n>=latest))throw Error('RECONCILE_WALLET_NONCES');return spent;
}
async function processEgg(){
 const all=births();let b=all.find(b=>['eligible','awaiting-signature','submitted'].includes(b.status));
 if(!b&&canStartEgg(all,Date.now())){const row=db.prepare("SELECT * FROM triggers WHERE status='queued' ORDER BY rowid LIMIT 1").get();if(!row)return;let e=JSON.parse(row.payload);if(e.kind==='surge'){const source=db.prepare('SELECT payload FROM trades WHERE id=?').get(e.tradeIds?.at(-1));if(!source)throw Error('SURGE_SOURCE_MISSING');const t=JSON.parse(source.payload);e={...e,hash:t.hash,block:t.block,blockHash:t.blockHash,sourceTrade:t};}if(Date.now()-e.timestamp>900000){db.prepare("UPDATE triggers SET status='expired' WHERE id=?").run(row.id);return;}
  if(e.hash&&(await rpc.getBlock(e.block))?.hash!==e.blockHash)throw Error('TRIGGER_REORGANIZED');
  job('assay','Measuring '+e.kind+' input in both founders',e.hash);const readout=await think(e.kind);neural={...readout,asOf:new Date().toISOString()};b=nextEgg({event:e,readout,ordinal:all.length+1});b.event=e;b.sourceToken=e.sourceToken??e.sourceTrade?.sourceToken??chain.token;db.exec('BEGIN IMMEDIATE');try{save(b);db.prepare("UPDATE triggers SET status='consumed' WHERE id=?").run(row.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }
 if(!b)return;
 if(b.browserAttemptedAt&&b.status!=='submitted'){processing={stage:b.preparationError?'paused':'browser',detail:b.preparationError??b.name,hash:b.tradeHash,asOf:stamp()};return;}
 processing={stage:b.status,detail:b.name,hash:b.tradeHash,asOf:stamp()};
 try{
  if(b.status==='submitted'){const verified=await verifyOffspring({birth:b,chain,rpc,owner});if(verified){journal(verified.status,b.name,b.hash);b={...b,...verified};delete b.preparationError;save(b);}return;}

  const spent=await accountedSpend(),prepared=await prepareOffspring({birth:b,chain,owner,rpc,spentWei:spent});if(b.status!=='awaiting-signature')journal('awaiting-signature',b.name,b.tradeHash);b={...b,status:'awaiting-signature',prepared};delete b.preparationError;save(b);
  if(!b.browserAttemptedAt){
   bindLiveAllowance(b,owner);
   const dir=resolve(root,'build/live-pilots',b.id);mkdirSync(dir,{recursive:true});
   b.browserAttemptedAt=stamp();save(b);writeFileSync(resolve(dir,'pilot.json'),JSON.stringify(b));
   writeFileSync(resolve(folder,'active-browser.json'),JSON.stringify({id:b.id}));
   const launch=spawn(process.execPath,[resolve(import.meta.dirname,'live-browser-runner.mjs')],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,FAMILY_PILOT_DIR:dir,FAMILY_LIVE_TEST:'1',FAMILY_BROWSER_CDP:'http://127.0.0.1:5192'}});
   launch.on('error',()=>{const latest=births().find(x=>x.id===b.id);if(latest&&!latest.hash){latest.preparationError='BROWSER_RUNNER_UNAVAILABLE';save(latest);}});
   job('browser','Measured cursor operating the PONS launch form',b.tradeHash);
  }
 }catch(e){b.preparationError=/^[A-Z_]+$/.test(e.message)?e.message:'DEPLOYMENT_CHECK_REQUIRED';save(b);}
}
process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});
createInterface({input:process.stdin}).on('line',line=>{if(line.trim()==='stop')running=false;});
startBrain();
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');if(req.method!=='GET'){res.writeHead(405).end();return;}if(req.url==='/frame.jpg'){if(!jpg){res.writeHead(503).end();return;}res.setHeader('Content-Type','image/jpeg');res.end(jpg);}else if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({pid:process.pid,uptimeSeconds:Math.round(process.uptime()),memoryMB:Math.round(process.memoryUsage().rss/1048576),lastPublish,publishedBytes,cameraAt:frameAt,scanAt:scan?.completedAt,brainAt:neural?.asOf,dossiers:dossiers.counts(),video:videoMetrics(),signingPaused:process.env.FAMILY_OBSERVE_ONLY==='1'}));}else if(req.url==='/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot()));}else{res.writeHead(404).end();}}).listen(Number(process.env.FAMILY_PORT??5190),'127.0.0.1');
try{
 browser=await chromium.launchPersistentContext(resolve(root,'build/external-pilot/browser-profile'),{channel:'chrome',headless:true,locale:'en-US',viewport:{width:1280,height:720},args:['--lang=en-US','--remote-debugging-port=5192','--remote-debugging-address=127.0.0.1']});page=await browser.newPage();
 await page.route('**/*',route=>{const req=route.request();if(req.isNavigationRequest()&&req.frame()===page.mainFrame()&&!allowedFieldUrl(req.url())&&!['www.ponsfamily.com','ponsfamily.com'].includes(new URL(req.url()).hostname))return route.abort();return route.continue();});
 await installObserverWallet(page,rpc,owner);
 await page.goto(EXPLORE_URL,{waitUntil:'domcontentloaded'});
 stopCapture=await captureBrowser(page,frame=>{if(idleControl?.status==='opening'||(process.env.FAMILY_OBSERVE_ONLY==='1'&&!allowedFieldUrl(page.url())))return;jpg=frame;frameAt=stamp();cameraError=null;});
 const roam=browserRoam({page,onState:s=>{idleControl=s;}});
 const video=videoServer(()=>{const pilot=readPilotView(root);return pilot?.frame?Buffer.from(pilot.frame.split(',')[1],'base64'):jpg;});
 videoMetrics=video.metrics;
 const lane=(name,interval,task,onError)=>runLane({interval,active:()=>running,task:async()=>{const t=Date.now();await task();loopTimes[name]={durationMs:Date.now()-t,asOf:stamp()};},onError});
 try{await Promise.all([
  lane('control',300,async()=>{try{if(readFileSync(resolve(folder,'stop.request'),'utf8').trim()===String(process.pid)){running=false;unlinkSync(resolve(folder,'stop.request'));}}catch{}}),
  lane('browser',100,async()=>{if(!readPilotView(root)){if(page.url().includes('ponsfamily.com')&&Date.now()-lastWalletCheck>15000){lastWalletCheck=Date.now();try{const connected=await connectObserverWallet(page);observerWallet={status:connected?'connected-read-only':'disconnected',owner,signing:'paused'};}catch{observerWallet={status:'connection-check-required',owner,signing:'paused'};}}if(!brainBusy)await roam();}},()=>{cameraError='Browser navigation unavailable';}),
  lane('camera',1000,async()=>{if((process.env.FAMILY_OBSERVE_ONLY!=='1'||allowedFieldUrl(page.url()))&&idleControl?.status!=='opening'&&(!frameAt||Date.now()-Date.parse(frameAt)>900)){jpg=await page.screenshot({type:'jpeg',quality:55});frameAt=stamp();}},()=>{cameraError='Camera unavailable';}),
  lane('chain',1000,async()=>{await collectExternal();observerError=null;},e=>{observerError=/^[A-Z_]+$/.test(e.message)?e.message:'CHAIN_UNAVAILABLE';}),
  lane('brain',1000,async()=>{if(!worker)startBrain();if(!worker||brainBusy||!jpg)return;brainBusy=true;try{const hasJob=db.prepare("SELECT count(*) n FROM triggers WHERE status='queued'").get().n||births().some(b=>['eligible','awaiting-signature','submitted'].includes(b.status));if(hasJob&&!observerError&&process.env.FAMILY_OBSERVE_ONLY!=='1')await processEgg();else processing=process.env.FAMILY_OBSERVE_ONLY==='1'?{stage:'paused',detail:'Signing paused; live browser and neural observations continue',asOf:stamp()}:null;const input=dossiers.next();if(input){try{neural={...await think(input.kind,true),asOf:stamp(),tradeId:input.id,tradeHash:input.hash};dossiers.complete(input,neural);}catch(e){dossiers.fail(input);throw e;}}else if(!neural?.asOf||Date.now()-Date.parse(neural.asOf)>9000)neural={...await think(null),asOf:stamp()};}finally{brainBusy=false;}},e=>{processing={stage:'paused',detail:/^[A-Z_]+$/.test(e.message)?e.message:'MODEL_CHECK_REQUIRED',asOf:stamp()};}),
  lane('publish',3000,publish,()=>{console.error('Publication unavailable');})
 ]);}finally{video.close();}
}finally{await stopCapture?.();worker?.kill();await browser?.close();rpc.destroy();server.close();db.close();closeSync(lock);unlinkSync(lockPath);}
