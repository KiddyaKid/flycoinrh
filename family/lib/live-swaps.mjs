import {Interface,keccak256} from 'ethers';
import {SWAP_ABI,decodeSwap,poolIdentity} from './v4-input.mjs';
import {tradeIdentity} from '../policy.mjs';
const abi=new Interface(SWAP_ABI);
export async function collectLiveSwaps({rpc,config,getCursor,commit,now=Date.now()}){
 const started=Date.now();
 if(Number((await rpc.getNetwork()).chainId)!==config.chainId)throw Error('WRONG_CHAIN');
 const top=await rpc.getBlock('latest'),safe=await rpc.getBlock(top.number-20);
 if(now-safe.timestamp*1000>180000)throw Error('STALE_CHAIN');
 const pools=new Map(config.pools.map(c=>{
  if(poolIdentity(c)!==c.poolId||![c.token0,c.token1].includes(config.token)||c.token!==config.token)throw Error('INVALID_INPUT_POOL');
  return [c.poolId,c];
 }));
 const managers=[...new Set(config.pools.map(c=>c.manager))];
 for(const manager of managers)if(keccak256(await rpc.getCode(manager,safe.number))!==config.pools.find(c=>c.manager===manager).managerCodeHash)throw Error('MANAGER_CODE_CHANGED');
 let cursor=getCursor();const bootstrap=!cursor;
 if(!cursor){const first=await rpc.getBlock(safe.number-1000);cursor={number:first.number,hash:first.hash};}
 if((await rpc.getBlock(cursor.number))?.hash!==cursor.hash)throw Error('CHAIN_REORGANIZED');
 const end=Math.min(safe.number,cursor.number+1500);
 if(end<cursor.number)throw Error('CHAIN_HEAD_BEHIND_CURSOR');
 const logs=end>cursor.number?await rpc.getLogs({address:managers,fromBlock:cursor.number+1,toBlock:end,topics:[abi.getEvent('Swap').topicHash,[...pools.keys()]]}):[];
 const receipts=new Map(),blocks=new Map(),memo=(cache,key,fn)=>{if(!cache.has(key))cache.set(key,fn());return cache.get(key);};
 const rows=[];
 // Bound concurrency; verify each log against its receipt and canonical block.
 for(let i=0;i<logs.length;i+=6){
  rows.push(...await Promise.all(logs.slice(i,i+6).map(async log=>{
   const [receipt,block]=await Promise.all([memo(receipts,log.transactionHash,()=>rpc.getTransactionReceipt(log.transactionHash)),memo(blocks,log.blockNumber,()=>rpc.getBlock(log.blockNumber))]);
   if(log.removed||receipt?.status!==1||receipt.blockHash!==block?.hash||log.blockHash!==block.hash||!receipt.logs.some(l=>l.index===log.index&&l.address.toLowerCase()===log.address.toLowerCase()&&l.data===log.data&&JSON.stringify(l.topics)===JSON.stringify(log.topics)))throw Error('UNVERIFIED_TRADE');
   const c=pools.get(log.topics[1]),event=decodeSwap(log,c,block);
   const row={...event,test:false,external:true,inputMode:'live-external',historical:bootstrap,observedAt:new Date().toISOString()};row.id=tradeIdentity(row);return row;
  })));
 }
 const block=await rpc.getBlock(end);
 if((await rpc.getBlock(safe.number))?.hash!==safe.hash)throw Error('CHAIN_REORGANIZED');
 rows.sort((a,b)=>a.block-b.block||a.index-b.index);commit(rows,{number:end,hash:block.hash});
 return {completedAt:new Date().toISOString(),head:top.number,safeHead:safe.number,scannedThrough:end,lagBlocks:safe.number-end,confirmations:20,token:config.token,poolCount:pools.size,coverage:config.coverage,adapter:'uniswap-v4',intervalMs:1000,rows:rows.length,durationMs:Date.now()-started};
}
