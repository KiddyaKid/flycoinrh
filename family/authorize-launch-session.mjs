// Operator entry point. Read-only unless --activate is explicitly supplied.
// Never reads the DPAPI credential. Reconciles every wallet nonce before creating an allowance.
import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {getAddress,formatEther,Contract,keccak256} from 'ethers';
import {provider,FACTORY_ABI} from './lib/pons.mjs';
import {sessionFile,SESSION_CAP_ETH,validateSession} from './lib/launch-session.mjs';
const root=resolve(import.meta.dirname,'../../..'),configFile=resolve(root,'work/runtime/family-runtime.json'),config=JSON.parse(readFileSync(configFile));
const chain=JSON.parse(readFileSync(new URL('./chain.json',import.meta.url))),pools=JSON.parse(readFileSync(new URL('./live-input-pools.json',import.meta.url))),prior=JSON.parse(readFileSync(config.FAMILY_PRIOR_TX_FILE));
const owner=getAddress(config.FAMILY_OPERATOR_ADDRESS??'0x9ca6276184a59d23ef97e1cd06c02c4a6af3322c'),rpc=provider(chain.rpcUrl),db=new DatabaseSync(resolve(config.FAMILY_STATE_DIR,'ledger.sqlite'));
try{
 const births=db.prepare('SELECT payload FROM births').all().map(r=>JSON.parse(r.payload));
 if(births.some(b=>['eligible','awaiting-signature','submitted'].includes(b.status)))throw Error('ACTIVE_BIRTH_REQUIRES_RECONCILIATION');
 const history=JSON.parse(readFileSync(resolve(root,'work/runtime/wallet-history-public.json'),'utf8').replace(/^\uFEFF/,''));
 let spent=0n;const nonces=new Set(),receipts=[];
 const hashes=[...new Set([chain.launchHash,prior.sweepHash,prior.claimHash,...births.map(b=>b.hash),...history.items.filter(t=>t.from?.hash?.toLowerCase()===owner.toLowerCase()).map(t=>t.hash)].filter(Boolean))];
 for(let i=0;i<hashes.length;i+=4){
  const batch=await Promise.all(hashes.slice(i,i+4).map(async hash=>{
   const [r,t]=await Promise.all([rpc.getTransactionReceipt(hash),rpc.getTransaction(hash)]);
   if(!r||!t||t.from!==owner||(await rpc.getBlock(r.blockNumber)).hash!==r.blockHash)throw Error('RECONCILE_WALLET_TRANSACTIONS');
   const cost=r.gasUsed*r.gasPrice+(r.status===1?t.value:0n);return {hash,nonce:t.nonce,costWei:String(cost),block:r.blockNumber,blockHash:r.blockHash};
  }));
  for(const r of batch){if(nonces.has(r.nonce))throw Error('DUPLICATE_WALLET_NONCE');nonces.add(r.nonce);spent+=BigInt(r.costWei);receipts.push(r);}
  console.log('Reconciled '+receipts.length+' historical receipts');
 }

 const [latest,pending,balance,network]=await Promise.all([rpc.getTransactionCount(owner,'latest'),rpc.getTransactionCount(owner,'pending'),rpc.getBalance(owner),rpc.getNetwork()]);
 if(latest!==pending||latest!==nonces.size||[...nonces].some(n=>n>=latest))throw Error('RECONCILE_WALLET_NONCES '+JSON.stringify({latest,pending,known:receipts}));
 if(Number(network.chainId)!==4663||keccak256(await rpc.getCode(chain.factory))!==chain.factoryCodeHash)throw Error('FACTORY_OR_CHAIN_CHANGED');
 const factory=new Contract(chain.factory,FACTORY_ABI,rpc),fee=await factory.launchFee();
 if(!await factory.launchEnabled()||!await factory.canLaunch(owner)||balance<=fee)throw Error('PONS_LAUNCH_UNAVAILABLE');
 const sourceToken=pools.sourceToken??pools.token;
 const startedAt=new Date().toISOString(),hls=JSON.parse(readFileSync(resolve(root,'work/runtime/hls.json')));
 const expiresAt=new Date(Math.min(Date.now()+30*3600000,Date.parse(hls.deadline))).toISOString();
 const a={schema:'flyfamily.launch-session.v1',id:randomUUID(),owner,chainId:4663,sourceToken,budgetETH:SESSION_CAP_ETH,baselineSpentWei:String(spent),baselineNonce:latest,startedAt,expiresAt,paused:false,receipts};
 validateSession(a,a.id);
 const report={owner,sourceToken,balanceETH:formatEther(balance),launchFeeETH:formatEther(fee),priorSpendETH:formatEther(spent),nonce:latest,budgetETH:SESSION_CAP_ETH,expiresAt};
 if(process.argv.includes('--activate')){
  if(config.FAMILY_OBSERVE_ONLY!=='1')throw Error('PAUSE_BEFORE_NEW_AUTHORIZATION');
  if(existsSync(sessionFile()))copyFileSync(sessionFile(),sessionFile()+'.'+Date.now()+'.backup');
  writeFileSync(sessionFile(),JSON.stringify(a,null,2),{mode:0o600});
  // Preserve historical records, but do not replay transactions from the paused period.
  db.exec('BEGIN IMMEDIATE');try{for(const r of db.prepare("SELECT id,payload FROM triggers WHERE status='queued'").all())if(JSON.parse(r.payload).timestamp<Date.parse(startedAt))db.prepare("UPDATE triggers SET status='expired' WHERE id=?").run(r.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  config.FAMILY_LAUNCH_SESSION=a.id;config.FAMILY_OBSERVE_ONLY='0';writeFileSync(configFile,JSON.stringify(config,null,2));
  console.log(JSON.stringify({...report,status:'authorized',sessionId:a.id}));
 }else console.log(JSON.stringify({...report,status:'preflight-only'}));
}finally{db.close();rpc.destroy();}
