// One real child deployment from a receipt-verified external swap replay.
// --execute is entered by the wallet owner in a local masked terminal.
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {createInterface as prompts} from 'node:readline/promises';
import {DatabaseSync} from 'node:sqlite';import {Wallet,Transaction,keccak256,getAddress,formatEther} from 'ethers';import {chromium} from 'playwright';
import {provider} from './lib/pons.mjs';import {prepareOffspring,verifyOffspring} from './lib/offspring-deploy.mjs';import {verifiedSwap} from './lib/v4-input.mjs';import {nextEgg,tradeIdentity} from './policy.mjs';
// Never echo third-party exception objects: wallet errors may contain input values.
process.on('uncaughtException',()=>{console.error('Pilot stopped. No new signing attempt will run automatically. Inspect saved status.');process.exit(1);});
const execute=process.argv.includes('--execute');if(process.argv.slice(2).some(a=>a!=='--execute'))throw Error('UNKNOWN_ARGUMENT');
if(execute)throw Error('DIRECT_SIGNING_DISABLED_USE_BROWSER_FLOW');
if(execute&&(!process.stdin.isTTY||!process.stdout.isTTY))throw Error('LOCAL_INTERACTIVE_TERMINAL_REQUIRED');
const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'build/external-pilot');mkdirSync(folder,{recursive:true});const file=resolve(folder,'pilot.json'),lockPath=resolve(folder,'operation.lock');const lock=openSync(lockPath,'wx');
const chain=JSON.parse(readFileSync(resolve(import.meta.dirname,'chain.json'))),input=JSON.parse(readFileSync(resolve(import.meta.dirname,'external-flybrain.json'))),rpc=provider(chain.rpcUrl),owner=getAddress('0x9ca6276184a59d23ef97e1cd06c02c4a6af3322c');
const familyDB=resolve(process.env.FAMILY_STATE_DIR??resolve(root,'build/family'),'ledger.sqlite');
let brain,browser,birth=existsSync(file)?JSON.parse(readFileSync(file)):null;
function save(){writeFileSync(file+'.tmp',JSON.stringify(birth,null,2));renameSync(file+'.tmp',file);}
async function spent(){
 const prior=JSON.parse(readFileSync(process.env.FAMILY_PRIOR_TX_FILE,'utf8')),db=new DatabaseSync(familyDB,{readOnly:true});let all;try{all=db.prepare('SELECT payload FROM births').all().map(r=>JSON.parse(r.payload));}finally{db.close();}
 const hashes=[chain.launchHash,prior.sweepHash,prior.claimHash,...all.map(b=>b.hash),birth?.hash].filter(Boolean);let total=0n;const nonces=new Set();
 for(const h of new Set(hashes)){const [r,t]=await Promise.all([rpc.getTransactionReceipt(h),rpc.getTransaction(h)]);if(!r||!t||t.from!==owner||(await rpc.getBlock(r.blockNumber)).hash!==r.blockHash)throw Error('UNRESOLVED_WALLET_TRANSACTION');total+=r.gasUsed*r.gasPrice+(r.status===1?t.value:0n);nonces.add(t.nonce);}
 const latest=await rpc.getTransactionCount(owner,'latest'),pending=await rpc.getTransactionCount(owner,'pending');if(latest!==pending||latest!==nonces.size||[...nonces].some(n=>n>=latest))throw Error('WALLET_NONCES_REQUIRE_RECONCILIATION');return total;
}
function maskedKey(){return new Promise((ok,fail)=>{let value='';process.stdout.write('Private key (local only, masked; never saved): ');process.stdin.setRawMode(true);process.stdin.resume();const end=e=>{process.stdin.off('data',on);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');e?fail(e):ok(value);value='';};const on=data=>{for(const c of data.toString()){if(c==='\u0003')return end(Error('CANCELLED'));if(c==='\r'||c==='\n')return end();if(c==='\b'||c==='\u007f'){value=value.slice(0,-1);continue;}if(/[0-9a-fA-FxX]/.test(c)&&value.length<66){value+=c;process.stdout.write('*');}}};process.stdin.on('data',on);});}
async function confirmReceipt(){for(let n=0;n<60;n++){const v=await verifyOffspring({birth,chain,rpc,owner});if(v){birth={...birth,...v};save();return;}await new Promise(r=>setTimeout(r,2000));}console.log('Receipt remains pending. Run again to reconcile; no replacement transaction.');}
try{
 if(!birth){
  const event=await verifiedSwap(rpc,input,input.sample.hash,input.sample.index);
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto(`https://www.ponsfamily.com/launchpad/${input.token}`,{waitUntil:'domcontentloaded',timeout:45000});const frame=resolve(folder,'input.jpg');await page.screenshot({path:frame,type:'jpeg',quality:70});await browser.close();browser=null;
  brain=spawn(process.env.FAMILY_PYTHON??'python',[resolve(import.meta.dirname,'brain.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});brain.stderr.on('data',()=>{});
  const readout=await new Promise((ok,fail)=>{const timer=setTimeout(()=>{brain.kill();fail(Error('MODEL_TIMEOUT'));},120000);const lines=createInterface({input:brain.stdout});brain.once('error',e=>{clearTimeout(timer);fail(e);});brain.once('exit',()=>{clearTimeout(timer);fail(Error('MODEL_EXIT'));});lines.on('line',line=>{clearTimeout(timer);try{const r=JSON.parse(line);if(r.error)throw Error(r.error);ok(r);}catch(e){fail(e);}});brain.stdin.write(JSON.stringify({id:'external-pilot',frame,kind:event.kind})+'\n');});brain.kill();brain=null;
  const db=new DatabaseSync(familyDB,{readOnly:true});let ordinal;try{ordinal=db.prepare('SELECT count(*) n FROM births').get().n+1;}finally{db.close();}
  birth={...nextEgg({event,readout,ordinal}),test:true,inputMode:'verified-replay',sourceToken:input.token,sourcePool:input.poolId,event,readout};birth.name=birth.name.replace(' #',' Test #');save();
 }
 const rawPath=resolve(folder,'deployment.signed-tx');
 if(existsSync(rawPath)&&!birth.hash){const raw=readFileSync(rawPath,'utf8'),t=Transaction.from(raw);if(t.from!==owner||t.to!==getAddress(chain.factory)||t.data!==birth.prepared?.tx.data||t.value!==BigInt(birth.prepared.tx.value))throw Error('RECOVERY_TRANSACTION_MISMATCH');birth={...birth,status:'submitted',hash:keccak256(raw),nonce:t.nonce};save();}
 if(birth.status==='submitted'){
  if(!await rpc.getTransaction(birth.hash)&&existsSync(rawPath)&&execute)await rpc.broadcastTransaction(readFileSync(rawPath,'utf8'));
  await confirmReceipt();
 }else if(['eligible','awaiting-signature'].includes(birth.status)){
  await verifiedSwap(rpc,input,birth.event.hash,birth.event.index);
  const counted=await spent();birth.prepared=await prepareOffspring({birth,chain,owner,rpc,spentWei:counted});birth.status='awaiting-signature';save();
  console.log(JSON.stringify({status:birth.status,name:birth.name,source:'FLYBRAIN external swap — VERIFIED HISTORICAL REPLAY',trade:birth.event.hash,tradeTime:new Date(birth.event.timestamp).toISOString(),active:birth.readout.parents.map(p=>({id:p.id,active:p.active})),owner,maximumCostETH:formatEther(birth.prepared.maximumWei),alreadySpentETH:formatEther(counted),totalBudgetETH:'0.02',testLimit:1,logo:birth.prepared.params.logo,x:birth.prepared.params.socials.twitter},null,2));
  if(execute){
   const io=prompts({input:process.stdin,output:process.stdout});const decision=await io.question('Deploy ONE test child on Robinhood Chain? Type DEPLOY (anything else cancels): ');io.close();if(decision!=='DEPLOY')throw Error('CANCELLED');let key=await maskedKey();if(!/^(0x)?[0-9a-fA-F]{64}$/.test(key)){key='';throw Error('INVALID_KEY_FORMAT');}let wallet;try{wallet=new Wallet(key);}finally{key='';}if(wallet.address!==owner)throw Error('WRONG_WALLET');
   birth.prepared=await prepareOffspring({birth,chain,owner,rpc,spentWei:await spent()});save();const nonce=await rpc.getTransactionCount(owner,'pending'),{from,...tx}=birth.prepared.tx;const raw=await wallet.signTransaction({...tx,nonce});writeFileSync(rawPath,raw,{flag:'wx',mode:0o600});birth={...birth,status:'submitted',hash:keccak256(raw),nonce,submittedAt:new Date().toISOString()};save();await rpc.broadcastTransaction(raw);console.log('Submitted '+birth.hash);await confirmReceipt();
  }
 }
 console.log(JSON.stringify({status:birth.status,name:birth.name,hash:birth.hash??null,token:birth.token??null}));
 if(birth.status==='confirmed'){
  const db=new DatabaseSync(familyDB);try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT OR IGNORE INTO births VALUES(?,?)').run(birth.id,JSON.stringify(birth));const event={...birth.event,id:tradeIdentity(birth.event),historical:true};db.prepare('INSERT OR IGNORE INTO trades VALUES(?,?)').run(event.id,JSON.stringify(event));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
 }
}finally{brain?.kill();await browser?.close();rpc.destroy();closeSync(lock);unlinkSync(lockPath);}

