// Local, bounded signer for a transaction actually requested by the PONS page.
// Automatic mode decrypts a Windows DPAPI credential only into local memory.
import {readFileSync,writeFileSync,renameSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';import {createHash} from 'node:crypto';import {createInterface} from 'node:readline/promises';import {DatabaseSync} from 'node:sqlite';
import {Wallet,Transaction,keccak256,getAddress,formatEther} from 'ethers';
import {provider} from './lib/pons.mjs';import {inspectPageRequest,preparePageRequest} from './lib/browser-wallet.mjs';import {verifyOffspring} from './lib/offspring-deploy.mjs';import {tradeIdentity} from './policy.mjs';
import {localKey} from './lib/local-key.mjs';
import {rawLogoCid} from './lib/logo-attestation.mjs';
const reprice=process.argv.includes('--reprice');
const automatic=process.argv.includes('--auto'),execute=automatic||process.argv.includes('--execute');if(process.argv.slice(2).some(a=>!['--execute','--auto','--reprice'].includes(a)))throw Error('UNKNOWN_ARGUMENT');
if(execute&&!automatic&&(!process.stdin.isTTY||!process.stdout.isTTY))throw Error('INTERACTIVE_TERMINAL_REQUIRED');
const root=resolve(import.meta.dirname,'..'),dir=resolve(process.env.FAMILY_PILOT_DIR??resolve(root,'build/external-pilot')),file=resolve(dir,'pilot.json'),request=JSON.parse(readFileSync(resolve(dir,'browser-request.json'))),chain=JSON.parse(readFileSync(resolve(import.meta.dirname,'chain.json'))),owner=getAddress('0x9ca6276184a59d23ef97e1cd06c02c4a6af3322c'),rpc=provider(chain.rpcUrl);
const dbFile=resolve(process.env.FAMILY_STATE_DIR??resolve(root,'build/family'),'ledger.sqlite'),rawFile=resolve(dir,'browser-signed-tx'),lockFile=resolve(dir,'browser-sign.lock'),lock=openSync(lockFile,'wx');let birth=JSON.parse(readFileSync(file));
writeFileSync(lock,String(process.pid));
function fresh(){const age=Date.now()-Date.parse(request.requestedAt);if(!Number.isFinite(age)||age<0||age>600000)throw Error('BROWSER_REQUEST_EXPIRED');}
function save(){writeFileSync(file+'.tmp',JSON.stringify(birth,(_,v)=>typeof v==='bigint'?String(v):v,2));renameSync(file+'.tmp',file);if(process.env.FAMILY_LIVE_TEST==='1'){const d=new DatabaseSync(dbFile);try{d.prepare('UPDATE births SET payload=? WHERE id=?').run(JSON.stringify(birth),birth.id);}finally{d.close();}}}
function result(){writeFileSync(resolve(dir,'browser-result.json'),JSON.stringify({birthId:birth.id,digest:request.digest,hash:birth.hash}));}
async function spent(excludeCurrent=false){
 const prior=JSON.parse(readFileSync(process.env.FAMILY_PRIOR_TX_FILE)),db=new DatabaseSync(dbFile,{readOnly:true});let rows;try{rows=db.prepare('SELECT payload FROM births').all().map(r=>JSON.parse(r.payload));}finally{db.close();}
 let sum=0n;const nonces=new Set();for(const h of new Set([chain.launchHash,prior.sweepHash,prior.claimHash,...rows.filter(b=>!excludeCurrent||b.id!==birth.id).map(b=>b.hash)].filter(Boolean))){const [r,t]=await Promise.all([rpc.getTransactionReceipt(h),rpc.getTransaction(h)]);if(!r||!t||t.from!==owner||(await rpc.getBlock(r.blockNumber)).hash!==r.blockHash)throw Error('RECONCILE_WALLET_TRANSACTIONS');sum+=r.gasUsed*r.gasPrice+(r.status===1?t.value:0n);nonces.add(t.nonce);}
 const latest=await rpc.getTransactionCount(owner,'latest'),pending=await rpc.getTransactionCount(owner,'pending');if(latest!==pending||latest!==nonces.size||[...nonces].some(n=>n>=latest))throw Error('RECONCILE_WALLET_NONCES');return sum;
}
function keyPrompt(){return new Promise((ok,fail)=>{let value='';process.stdout.write('Private key (masked; local memory only): ');process.stdin.setRawMode(true);process.stdin.resume();const end=e=>{process.stdin.off('data',on);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');e?fail(e):ok(value);value='';};const on=data=>{for(const c of data.toString()){if(c==='\u0003')return end(Error('CANCELLED'));if(c==='\r'||c==='\n')return end();if(c==='\b'||c==='\u007f'){value=value.slice(0,-1);continue;}if(/[0-9a-fA-FxX]/.test(c)&&value.length<66){value+=c;process.stdout.write('*');}}};process.stdin.on('data',on);});}
try{
 if(existsSync(rawFile+'.next')){const next=Transaction.from(readFileSync(rawFile+'.next','utf8'));if(next.hash!==birth.hash||next.nonce!==birth.nonce||next.from!==owner||next.to!==getAddress(chain.factory)||next.data!==birth.prepared.tx.data||next.value!==BigInt(birth.prepared.tx.value))throw Error('REPLACEMENT_RECOVERY_MISMATCH');renameSync(rawFile+'.next',rawFile);}
 if(request.birthId!==birth.id||request.digest!==createHash('sha256').update(JSON.stringify(request.tx)).digest('hex')||request.source!=='pons-page-eth_sendTransaction'||new URL(request.url).origin!=='https://www.ponsfamily.com'||!request.cursor?.hit)throw Error('BROWSER_PROVENANCE_MISMATCH');
 if(existsSync(rawFile)&&!birth.hash){const raw=readFileSync(rawFile,'utf8'),t=Transaction.from(raw);if(t.from!==owner||t.to!==getAddress(chain.factory)||t.data!==birth.prepared.tx.data||t.value!==BigInt(birth.prepared.tx.value))throw Error('RECOVERY_TRANSACTION_MISMATCH');birth={...birth,status:'submitted',hash:keccak256(raw),nonce:t.nonce};save();}
 if(reprice){
  if(!automatic||process.env.FAMILY_LIVE_TEST!=='1'||birth.status!=='submitted'||!birth.hash||!existsSync(rawFile))throw Error('REPRICE_NOT_ELIGIBLE');
  fresh();const previous=Transaction.from(readFileSync(rawFile,'utf8'));
  if(previous.hash!==birth.hash||previous.from!==owner||previous.to!==getAddress(chain.factory)||previous.data!==birth.prepared.tx.data||previous.value!==BigInt(birth.prepared.tx.value)||previous.nonce!==birth.nonce)throw Error('REPRICE_IDENTITY_MISMATCH');
  const [receipt,known,latestNonce,pendingNonce]=await Promise.all([rpc.getTransactionReceipt(birth.hash),rpc.getTransaction(birth.hash),rpc.getTransactionCount(owner,'latest'),rpc.getTransactionCount(owner,'pending')]);
  if(receipt||known||latestNonce!==previous.nonce||pendingNonce!==previous.nonce)throw Error('REPRICE_RECONCILIATION_REQUIRED');
  const logo=rawLogoCid(readFileSync(resolve(root,'assets/flyfamily-logo.jpg'))),cost=await spent(true);
  const prepared=await preparePageRequest({tx:request.tx,birth,chain,owner,rpc,spentWei:cost,verifiedLogo:logo.url});
  if(BigInt(prepared.tx.gasPrice)<=previous.gasPrice)throw Error('REPRICE_NOT_NEEDED');
  let key=await localKey(birth,owner),wallet;try{wallet=new Wallet(key);}finally{key='';}if(wallet.address!==owner)throw Error('WRONG_WALLET');
  const {from,...tx}=prepared.tx,raw=await wallet.signTransaction({...tx,type:0,nonce:previous.nonce});
  // The replacement has exactly the same nonce, destination, calldata and value.
  // Save its hash before broadcasting; restarting never creates another deployment.
  writeFileSync(rawFile+'.next',raw,{flag:'wx',mode:0o600});
  birth.replacedHashes=[...(birth.replacedHashes??[]),birth.hash];birth.hash=keccak256(raw);birth.prepared={...birth.prepared,...prepared};save();
  renameSync(rawFile+'.next',rawFile);
 }
 if(!birth.hash){
  fresh();
  const p=inspectPageRequest(request.tx,birth,chain,owner);
  // Image attestation is written only after checking the actual uploaded logo.
  const logo=process.env.FAMILY_LIVE_TEST==='1'?{birthId:birth.id,...rawLogoCid(readFileSync(resolve(root,'assets/flyfamily-logo.jpg')))}:JSON.parse(readFileSync(resolve(dir,'verified-logo.json')));
  if(logo.birthId!==birth.id||logo.url!==p.logo||logo.sourceSha256!==createHash('sha256').update(readFileSync(resolve(root,'assets/flyfamily-logo.jpg'))).digest('hex'))throw Error('LOGO_NOT_VERIFIED');
  const cost=await spent();const prepared=await preparePageRequest({tx:request.tx,birth,chain,owner,rpc,spentWei:cost,verifiedLogo:logo.url});birth.prepared={...birth.prepared,...prepared};birth.browserRequestDigest=request.digest;save();
  console.log(JSON.stringify({status:'ready-for-local-signature',name:birth.name,source:'actual PONS page request',owner,maximumETH:formatEther(prepared.maximumWei),alreadySpentETH:formatEther(cost),totalBudgetETH:'0.02',testLimit:1}));
  if(!execute)process.exitCode=0;
  else{
   if(!automatic){const prompt=createInterface({input:process.stdin,output:process.stdout});const yes=await prompt.question('Type DEPLOY to sign ONE page-requested test launch: ');prompt.close();if(yes!=='DEPLOY')throw Error('CANCELLED');}
   let key=automatic?await localKey(birth,owner):await keyPrompt();let wallet;try{if(!/^(0x)?[0-9a-fA-F]{64}$/.test(key))throw Error('INVALID_KEY');wallet=new Wallet(key);}finally{key='';}if(wallet.address!==owner)throw Error('WRONG_WALLET');fresh();
   const latest=await preparePageRequest({tx:request.tx,birth,chain,owner,rpc,spentWei:await spent(),verifiedLogo:logo.url});birth.prepared={...birth.prepared,...latest};save();const nonce=await rpc.getTransactionCount(owner,'pending'),{from,...tx}=latest.tx,raw=await wallet.signTransaction({...tx,nonce});writeFileSync(rawFile,raw,{flag:'wx',mode:0o600});birth={...birth,status:'submitted',hash:keccak256(raw),nonce};save();await rpc.broadcastTransaction(raw);result();console.log('Submitted '+birth.hash);
  }
 }
 if(birth.status==='submitted'){
  if(!await rpc.getTransaction(birth.hash)&&execute&&existsSync(rawFile))await rpc.broadcastTransaction(readFileSync(rawFile,'utf8'));
  result();for(let i=0;i<60;i++){const v=await verifyOffspring({birth,chain,rpc,owner});if(v){birth={...birth,...v};delete birth.preparationError;save();break;}await new Promise(r=>setTimeout(r,2000));}
 }
 if(birth.status==='confirmed'){
  writeFileSync(resolve(dir,'signer-status.json'),JSON.stringify({status:'confirmed',hash:birth.hash,token:birth.token,at:new Date().toISOString()}));
  const db=new DatabaseSync(dbFile);try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT OR IGNORE INTO births VALUES(?,?)').run(birth.id,JSON.stringify(birth));if(birth.event.kind!=='surge'){const e={...birth.event,id:tradeIdentity(birth.event),historical:process.env.FAMILY_LIVE_TEST!=='1'};db.prepare('INSERT OR IGNORE INTO trades VALUES(?,?)').run(e.id,JSON.stringify(e));}db.exec('COMMIT');}finally{db.close();}
  console.log(JSON.stringify({status:birth.status,hash:birth.hash,token:birth.token}));
 }
}catch(e){const code=/^[A-Z_]+$/.test(e.message)?e.message:'LOCAL_SIGNING_STOPPED_REVIEW_SAVED_STATE';writeFileSync(resolve(dir,'signer-status.json'),JSON.stringify({status:'stopped',code,rpcCode:e.info?.error?.code??e.error?.code??e.code??null,rpcMessage:String(e.info?.error?.message??e.error?.message??e.shortMessage??'').replace(/0x[a-fA-F0-9]{40,}/g,'[redacted transaction data]').slice(0,220),at:new Date().toISOString()}));console.error(code);process.exitCode=1;}
finally{rpc.destroy();closeSync(lock);unlinkSync(lockFile);}
