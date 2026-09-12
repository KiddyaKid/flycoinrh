import {Interface,keccak256} from 'ethers';
import {SWAP_ABI,decodeSwap,poolIdentity} from './v4-input.mjs';
import {tradeIdentity} from '../policy.mjs';
import {CURVE_ABI} from './pons.mjs';
const abi=new Interface(SWAP_ABI);
const curveAbi=new Interface(CURVE_ABI);
export function decodeCurveTrade(log,c,block){
 if(log.address.toLowerCase()!==c.curve.toLowerCase())throw Error('WRONG_CURVE');
 const e=curveAbi.parseLog(log);if(!['CurveBuy','CurveSell'].includes(e?.name))throw Error('WRONG_CURVE_EVENT');
 const kind=e.name==='CurveBuy'?'buy':'sell';
 return {hash:log.transactionHash,index:log.index,kind,quoteWei:String(kind==='buy'?e.args.quoteIn:e.args.quoteOut),quoteSymbol:c.quoteSymbol,quoteDecimals:c.quoteDecimals,timestamp:block.timestamp*1000,block:block.number,blockHash:block.hash,sourceToken:c.token,sourcePool:c.curve};
}
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
 if(config.curve)for(const key of ['curve','token'])if(keccak256(await rpc.getCode(config[key],safe.number))!==config[key+'CodeHash'])throw Error('INPUT_CODE_CHANGED');
 let cursor=getCursor();const bootstrap=!cursor;
 if(!cursor){const first=await rpc.getBlock(safe.number-1000);cursor={number:first.number,hash:first.hash};}
 if((await rpc.getBlock(cursor.number))?.hash!==cursor.hash)throw Error('CHAIN_REORGANIZED');
 const end=Math.min(safe.number,cursor.number+1500);
 if(end<cursor.number)throw Error('CHAIN_HEAD_BEHIND_CURSOR');
 const logs=end>cursor.number?(await Promise.all([
  ...(managers.length?[rpc.getLogs({address:managers,fromBlock:cursor.number+1,toBlock:end,topics:[abi.getEvent('Swap').topicHash,[...pools.keys()]]})]:[]),
  ...(config.curve?[rpc.getLogs({address:config.curve,fromBlock:cursor.number+1,toBlock:end,topics:[[curveAbi.getEvent('CurveBuy').topicHash,curveAbi.getEvent('CurveSell').topicHash]]})]:[])
 ])).flat():[];
 const receipts=new Map(),blocks=new Map(),memo=(cache,key,fn)=>{if(!cache.has(key))cache.set(key,fn());return cache.get(key);};
 const rows=[];
 // Bound concurrency; verify each log against its receipt and canonical block.
 for(let i=0;i<logs.length;i+=6){
  rows.push(...await Promise.all(logs.slice(i,i+6).map(async log=>{
   const [receipt,block]=await Promise.all([memo(receipts,log.transactionHash,()=>rpc.getTransactionReceipt(log.transactionHash)),memo(blocks,log.blockNumber,()=>rpc.getBlock(log.blockNumber))]);
   if(log.removed||receipt?.status!==1||receipt.blockHash!==block?.hash||log.blockHash!==block.hash||!receipt.logs.some(l=>l.index===log.index&&l.address.toLowerCase()===log.address.toLowerCase()&&l.data===log.data&&JSON.stringify(l.topics)===JSON.stringify(log.topics)))throw Error('UNVERIFIED_TRADE');
   const event=config.curve&&log.address.toLowerCase()===config.curve.toLowerCase()?decodeCurveTrade(log,config,block):decodeSwap(log,pools.get(log.topics[1]),block);
   const row={...event,test:false,external:!config.curve,inputMode:config.curve?'live-founder':'live-external',historical:bootstrap,observedAt:new Date().toISOString()};row.id=tradeIdentity(row);return row;
  })));
 }
 const block=await rpc.getBlock(end);
 if((await rpc.getBlock(safe.number))?.hash!==safe.hash)throw Error('CHAIN_REORGANIZED');
 rows.sort((a,b)=>a.block-b.block||a.index-b.index);commit(rows,{number:end,hash:block.hash});
 return {completedAt:new Date().toISOString(),head:top.number,safeHead:safe.number,scannedThrough:end,lagBlocks:safe.number-end,confirmations:20,token:config.token,poolCount:pools.size,coverage:config.coverage,adapter:config.curve?'pons-curve-and-v4':'uniswap-v4',intervalMs:1000,rows:rows.length,durationMs:Date.now()-started};
}
