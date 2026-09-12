// One process owns the browser, confirmed-chain cursor and durable birth queue.
// Public HTTP is read-only. Signing is opt-in, never reachable from browser input.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {chromium} from 'playwright';
import {Contract,Interface,Wallet,getAddress,keccak256,parseEther} from 'ethers';
import {provider,CURVE_ABI} from './lib/pons.mjs';
import {prepareOffspring,verifyOffspring} from './lib/offspring-deploy.mjs';
import {tradeIdentity,volumeSurge,nextEgg,canStartEgg,publicBirth,MAX_PENDING,VERSION,X_URL,LOGO_URL} from './policy.mjs';
const root=resolve(import.meta.dirname,'..'),folder=resolve(process.env.FAMILY_STATE_DIR??resolve(root,'build/family'));
mkdirSync(folder,{recursive:true});
const lockPath=resolve(folder,'process.lock'),lock=openSync(lockPath,'wx');writeFileSync(lock,String(process.pid));
const chain=JSON.parse(readFileSync(resolve(import.meta.dirname,'chain.json'),'utf8'));
const owner=getAddress(process.env.FAMILY_OPERATOR_ADDRESS??'0x9ca6276184a59d23ef97e1cd06c02c4a6af3322c');
const rpc=provider(process.env.FAMILY_RPC??chain.rpcUrl),abi=new Interface(CURVE_ABI);
const db=new DatabaseSync(resolve(folder,'ledger.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT); CREATE TABLE IF NOT EXISTS trades(id TEXT PRIMARY KEY,payload TEXT); CREATE TABLE IF NOT EXISTS triggers(id TEXT PRIMARY KEY,payload TEXT,status TEXT); CREATE TABLE IF NOT EXISTS births(id TEXT PRIMARY KEY,payload TEXT);');
const get=k=>{const r=db.prepare('SELECT v FROM meta WHERE k=?').get(k);return r?JSON.parse(r.v):null;};
const put=(k,v)=>db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,JSON.stringify(v));
const births=()=>db.prepare('SELECT payload FROM births ORDER BY rowid').all().map(r=>JSON.parse(r.payload));
const save=b=>db.prepare('INSERT INTO births VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(b.id,JSON.stringify(b));
if(!get('runId'))put('runId',crypto.randomUUID());
let running=true,browser,page,jpg=null,frameAt=null,neural=null,cameraError=null,observerError=null,revision=get('revision')??0,activeBrowserBirth=null;
let worker=null,answer=null;
function startBrain(){
 if(!process.env.FAMILY_GRAPH||!process.env.FAMILY_GRAPH_SHA256||!process.env.FAMILY_ANNOTATIONS){cameraError='Brain data not configured';return;}
 worker=spawn(process.env.FAMILY_PYTHON??'python',[resolve(import.meta.dirname,'brain.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 createInterface({input:worker.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(answer){const a=answer;answer=null;r.error?a.reject(Error('BRAIN_MEASUREMENT_FAILED')):a.resolve(r);}}catch{}});
 worker.stderr.on('data',()=>{cameraError='Brain worker requires attention';});
 worker.on('error',()=>{cameraError='Brain worker unavailable';});
 worker.on('exit',()=>{worker=null;if(answer){answer.reject(Error('BRAIN_WORKER_STOPPED'));answer=null;}});
}
async function think(kind){if(!worker||!jpg)throw Error('BRAIN_OR_FRAME_UNAVAILABLE');const path=resolve(folder,'brain-frame.jpg');writeFileSync(path,jpg);const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{answer=null;worker?.kill();reject(Error('BRAIN_TIMEOUT'));},120000);answer={resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}};worker.stdin.write(JSON.stringify({id,frame:path,kind})+'\n');});}
function snapshot(){const all=births();return {schema:'flyfamily.live.v1',ruleVersion:VERSION,runId:get('runId'),revision,asOf:new Date().toISOString(),status:observerError?'unavailable':'watching',observerError,camera:{status:frameAt&&Date.now()-Date.parse(frameAt)<15000?'live':'offline',asOf:frameAt,url:page?.url()??null,error:cameraError},frame:jpg?'data:image/jpeg;base64,'+jpg.toString('base64'):null,neural,births:all.slice(-100).map(publicBirth),offspringCount:all.filter(b=>b.status==='confirmed').length,queueDepth:db.prepare("SELECT count(*) n FROM triggers WHERE status='queued'").get().n,records:db.prepare('SELECT payload FROM trades ORDER BY rowid DESC LIMIT 30').all().map(r=>JSON.parse(r.payload)),cursor:get('cursor'),social:X_URL,logo:LOGO_URL};}
let publisher=null;try{publisher=JSON.parse(readFileSync(process.env.FAMILY_PUBLISH_FILE,'utf8'));}catch{}
async function publish(){revision++;put('revision',revision);const s=snapshot();writeFileSync(resolve(folder,'snapshot.tmp'),JSON.stringify(s));renameSync(resolve(folder,'snapshot.tmp'),resolve(folder,'snapshot.json'));if(publisher){const u=new URL('/api/family',publisher.endpoint);const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-Fruit-Ingest-Key':publisher.ingestKey},body:JSON.stringify(s),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('PUBLICATION_FAILED_'+r.status);}}
function enqueue(e){const count=db.prepare("SELECT count(*) n FROM triggers WHERE status='queued'").get().n;db.prepare('INSERT OR IGNORE INTO triggers VALUES(?,?,?)').run(e.id,JSON.stringify(e),count<MAX_PENDING?'queued':'capacity');}
async function collect(){
 if(Number((await rpc.getNetwork()).chainId)!==chain.chainId)throw Error('WRONG_CHAIN');
 const top=await rpc.getBlock('latest'),head=await rpc.getBlock(top.number-20);
 if(Date.now()-head.timestamp*1000>180000)throw Error('STALE_CHAIN');
 for(const k of ['token','curve','factory'])if(keccak256(await rpc.getCode(chain[k],head.number))!==chain[k+'CodeHash'])throw Error('CODE_CHANGED');
 if(await new Contract(chain.curve,['function graduated() view returns(bool)'],rpc).graduated({blockTag:head.number}))throw Error('POOL_ADAPTER_REQUIRED_AFTER_GRADUATION');
 let cursor=get('cursor');if(!get('historyImported')){
  // Import known founder-token receipts as history only; never enqueue them.
  for(const hash of chain.recordedTradeHashes??[]){const receipt=await rpc.getTransactionReceipt(hash);if(receipt?.status!==1||receipt.blockNumber>head.number||(await rpc.getBlock(receipt.blockNumber))?.hash!==receipt.blockHash)throw Error('HISTORICAL_RECEIPT_INVALID');for(const l of receipt.logs){if(l.address.toLowerCase()!==chain.curve.toLowerCase())continue;let e;try{e=abi.parseLog(l);}catch{continue;}if(!['CurveBuy','CurveSell'].includes(e?.name))continue;const block=await rpc.getBlock(l.blockNumber),kind=e.name==='CurveBuy'?'buy':'sell',t={hash,index:l.index,kind,quoteWei:String(kind==='buy'?e.args.quoteIn:e.args.quoteOut),timestamp:block.timestamp*1000,block:l.blockNumber,blockHash:block.hash,historical:true};t.id=tradeIdentity(t);db.prepare('INSERT OR IGNORE INTO trades VALUES(?,?)').run(t.id,JSON.stringify(t));}}
  put('historyImported',true);}
 if(!cursor){put('cursor',{number:head.number,hash:head.hash});return;}

 if((await rpc.getBlock(cursor.number))?.hash!==cursor.hash)throw Error('CHAIN_REORGANIZED');
 const to=Math.min(head.number,cursor.number+1500);if(to<=cursor.number)return;
 const logs=await rpc.getLogs({address:chain.curve,fromBlock:cursor.number+1,toBlock:to,topics:[[abi.getEvent('CurveBuy').topicHash,abi.getEvent('CurveSell').topicHash]]});const rows=[];
 for(const log of logs.sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index)){
  const [receipt,block]=await Promise.all([rpc.getTransactionReceipt(log.transactionHash),rpc.getBlock(log.blockNumber)]);
  if(log.removed||receipt?.status!==1||receipt.blockHash!==block.hash||log.blockHash!==block.hash||!receipt.logs.some(l=>l.index===log.index&&l.address.toLowerCase()===chain.curve.toLowerCase()&&l.data===log.data&&JSON.stringify(l.topics)===JSON.stringify(log.topics)))throw Error('UNVERIFIED_TRADE');
  const e=abi.parseLog(log),kind=e.name==='CurveBuy'?'buy':'sell',t={hash:log.transactionHash,index:log.index,kind,quoteWei:String(kind==='buy'?e.args.quoteIn:e.args.quoteOut),timestamp:block.timestamp*1000,block:log.blockNumber,blockHash:block.hash};t.id=tradeIdentity(t);rows.push(t);
 }
 const end=await rpc.getBlock(to);if((await rpc.getBlock(head.number))?.hash!==head.hash)throw Error('CHAIN_REORGANIZED');
 db.exec('BEGIN IMMEDIATE');try{for(const t of rows){const inserted=db.prepare('INSERT OR IGNORE INTO trades VALUES(?,?)').run(t.id,JSON.stringify(t));if(inserted.changes)enqueue(t);}put('cursor',{number:to,hash:end.hash});const recent=db.prepare('SELECT payload FROM trades ORDER BY rowid DESC LIMIT 3000').all().map(r=>JSON.parse(r.payload));const surge=volumeSurge(recent,head.timestamp*1000);if(surge)enqueue(surge);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
async function accountedSpend(){
 let prior={};try{prior=JSON.parse(readFileSync(process.env.FAMILY_PRIOR_TX_FILE,'utf8'));}catch{throw Error('PRIOR_SPEND_RECONCILIATION_REQUIRED');}
 const hashes=[chain.launchHash,prior.sweepHash,prior.claimHash,...births().map(b=>b.hash)].filter(Boolean),nonces=new Set();let spent=0n;
 for(const h of new Set(hashes)){const r=await rpc.getTransactionReceipt(h),t=await rpc.getTransaction(h);if(!r||!t||t.from!==owner||(await rpc.getBlock(r.blockNumber))?.hash!==r.blockHash)throw Error('UNRESOLVED_WALLET_TX');spent+=r.gasUsed*r.gasPrice+(r.status===1?t.value:0n);nonces.add(t.nonce);}
 const pending=await rpc.getTransactionCount(owner,'pending'),latest=await rpc.getTransactionCount(owner,'latest');if(pending!==latest||latest!==nonces.size||[...nonces].some(n=>n>=latest))throw Error('RECONCILE_WALLET_NONCES');return spent;
}
async function processEgg(){
 const all=births();let b=all.find(b=>['eligible','awaiting-signature','submitted'].includes(b.status));
 if(!b&&canStartEgg(all,Date.now())){const row=db.prepare("SELECT * FROM triggers WHERE status='queued' ORDER BY rowid LIMIT 1").get();if(!row)return;const e=JSON.parse(row.payload);if(Date.now()-e.timestamp>900000){db.prepare("UPDATE triggers SET status='expired' WHERE id=?").run(row.id);return;}
  if(e.hash&&(await rpc.getBlock(e.block))?.hash!==e.blockHash)throw Error('TRIGGER_REORGANIZED');
  const readout=await think(e.kind);neural={...readout,asOf:new Date().toISOString()};b=nextEgg({event:e,readout,ordinal:all.length+1});db.exec('BEGIN IMMEDIATE');try{save(b);db.prepare("UPDATE triggers SET status='consumed' WHERE id=?").run(row.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }
 if(!b)return;
 try{
  if(b.status==='submitted'){const verified=await verifyOffspring({birth:b,chain,rpc,owner});if(verified){b={...b,...verified};delete b.preparationError;save(b);if(b.token)await page?.goto(`https://www.ponsfamily.com/launchpad/${b.token}`,{waitUntil:'domcontentloaded'});}return;}
  if(activeBrowserBirth!==b.id&&page){activeBrowserBirth=b.id;await page.goto('https://www.ponsfamily.com/launchpad/create',{waitUntil:'domcontentloaded'});for(const [selector,value] of [['input[placeholder="Token name"]',b.name],['input[placeholder="symbol"]',b.symbol],['input[placeholder="handle"]','flyfamilyrh']]){try{await page.locator(selector).fill(value,{timeout:2000});}catch{}}try{await page.locator('input[type="file"]').setInputFiles(resolve(root,'assets/flyfamily-logo.jpg'),{timeout:2000});}catch{}}
  const spent=await accountedSpend(),prepared=await prepareOffspring({birth:b,chain,owner,rpc,spentWei:spent});b={...b,status:'awaiting-signature',prepared};delete b.preparationError;save(b);
  if(process.argv.includes('--execute')&&process.env.FAMILY_SIGNER_KEY_FILE){
   const wallet=new Wallet(readFileSync(process.env.FAMILY_SIGNER_KEY_FILE,'utf8').trim());if(wallet.address!==owner)throw Error('WRONG_SIGNER');await accountedSpend();const nonce=await rpc.getTransactionCount(owner,'pending'),{from,...tx}=prepared.tx,raw=await wallet.signTransaction({...tx,nonce}),hash=keccak256(raw);b={...b,status:'submitted',hash,nonce,submittedAt:new Date().toISOString()};writeFileSync(resolve(folder,b.id+'.signed-tx'),raw,{flag:'wx'});save(b);await rpc.broadcastTransaction(raw);
  }
 }catch(e){b.preparationError=/^[A-Z_]+$/.test(e.message)?e.message:'DEPLOYMENT_CHECK_REQUIRED';save(b);}
}
process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});
createInterface({input:process.stdin}).on('line',line=>{if(line.trim()==='stop')running=false;});
startBrain();
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');if(req.method!=='GET'){res.writeHead(405).end();return;}if(req.url==='/frame.jpg'){if(!jpg){res.writeHead(503).end();return;}res.setHeader('Content-Type','image/jpeg');res.end(jpg);}else if(req.url==='/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot()));}else{res.writeHead(404).end();}}).listen(Number(process.env.FAMILY_PORT??5190),'127.0.0.1');
try{
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.route('**/*',route=>{const req=route.request();if(req.isNavigationRequest()&&req.frame()===page.mainFrame()&&!['www.ponsfamily.com','ponsfamily.com'].includes(new URL(req.url()).hostname))return route.abort();return route.continue();});
 await page.goto(`https://www.ponsfamily.com/launchpad/${chain.token}`,{waitUntil:'domcontentloaded'});
 let chainAt=0,brainAt=0;
 while(running){
  try{if(readFileSync(resolve(folder,'stop.request'),'utf8').trim()===String(process.pid)){running=false;unlinkSync(resolve(folder,'stop.request'));break;}}catch{}
  try{jpg=await page.screenshot({type:'jpeg',quality:55});frameAt=new Date().toISOString();cameraError=null;}catch{cameraError='Camera unavailable';}
  if(Date.now()-chainAt>10000){try{await collect();observerError=null;}catch(e){observerError=/^[A-Z_]+$/.test(e.message)?e.message:'CHAIN_UNAVAILABLE';}chainAt=Date.now();}
  if(worker&&Date.now()-brainAt>10000){try{neural={...await think(null),asOf:new Date().toISOString()};}catch{cameraError='Neural readout unavailable';}brainAt=Date.now();}
  if(!observerError)try{await processEgg();}catch(e){observerError=/^[A-Z_]+$/.test(e.message)?e.message:'EGG_PROCESSING_PAUSED';}
  try{await publish();}catch{console.error('Publication unavailable');}
  await new Promise(r=>setTimeout(r,1000));
 }
}finally{worker?.kill();await browser?.close();rpc.destroy();server.close();db.close();closeSync(lock);unlinkSync(lockPath);}
