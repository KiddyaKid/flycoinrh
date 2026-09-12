import {readSession} from './launch-session.mjs';
// A canonical baseline covers historical manual activity. Any unrecorded nonce
// AFTER activation blocks the automated lane instead of being silently ignored.
export async function reconcileWalletSpend({rpc,owner,hashes,session=process.env.FAMILY_LAUNCH_SESSION?readSession():null}){
 const a=session;
 let spent=a?BigInt(a.baselineSpentWei):0n;
 const baseline=new Set(a?.receipts.map(r=>r.hash.toLowerCase())??[]),nonces=new Set();
 if(a){
  const anchor=a.receipts.reduce((p,r)=>r.block>p.block?r:p);
  if((await rpc.getBlock(anchor.block))?.hash!==anchor.blockHash)throw Error('SESSION_BASELINE_REORGANIZED');
 }
 for(const hash of new Set([...hashes,...(a?.reconciledManualHashes??[])].filter(Boolean))){
  if(baseline.has(hash.toLowerCase()))continue;
  const [r,t]=await Promise.all([rpc.getTransactionReceipt(hash),rpc.getTransaction(hash)]);
  if(!r||!t||t.from!==owner||(await rpc.getBlock(r.blockNumber))?.hash!==r.blockHash||t.nonce<(a?.baselineNonce??0)||nonces.has(t.nonce))throw Error('UNRESOLVED_WALLET_TX');
  spent+=r.gasUsed*r.gasPrice+(r.status===1?t.value:0n);nonces.add(t.nonce);
 }
 const [latest,pending]=await Promise.all([rpc.getTransactionCount(owner,'latest'),rpc.getTransactionCount(owner,'pending')]);
 if(latest!==pending||latest!==(a?.baselineNonce??0)+nonces.size||[...nonces].some(n=>n>=latest))throw Error('RECONCILE_WALLET_NONCES');
 return spent;
}
