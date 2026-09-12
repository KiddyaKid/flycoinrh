import {readFileSync,writeFileSync} from 'node:fs';
import {Contract,Interface,getAddress,keccak256,ZeroAddress} from 'ethers';
import {provider} from './lib/pons.mjs';
import {poolIdentity} from './lib/v4-input.mjs';
const base=JSON.parse(readFileSync(new URL('./external-flybrain.json',import.meta.url),'utf8'));
// The index supplies candidate IDs only. Currency bindings are verified on chain below.
const response=await fetch('https://api.dexscreener.com/latest/dex/tokens/'+base.token,{signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('POOL_DISCOVERY_UNAVAILABLE');
const candidates=await response.json();
const rpc=provider('https://rpc.mainnet.chain.robinhood.com');
const init=new Interface(['event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)']);
try{
 if(Number((await rpc.getNetwork()).chainId)!==4663)throw Error('WRONG_CHAIN');
 const top=await rpc.getBlock('latest'),block=await rpc.getBlock(top.number-20);
 if(keccak256(await rpc.getCode(base.manager,block.number))!==base.managerCodeHash)throw Error('MANAGER_CHANGED');
 const ids=candidates.pairs.map(p=>p.pairAddress).filter(p=>/^0x[a-fA-F0-9]{64}$/.test(p));
 const logs=await rpc.getLogs({address:base.manager,fromBlock:0,toBlock:block.number,topics:[init.getEvent('Initialize').topicHash,ids]});
 const quotes=new Map(),pools=[];
 for(const log of logs){
  const e=init.parseLog(log),a=e.args,token0=getAddress(a.currency0),token1=getAddress(a.currency1);
  if(![token0,token1].includes(base.token))continue;
  const quote=token0===base.token?token1:token0;
  if(!quotes.has(quote)){
   const q=new Contract(quote,['function symbol() view returns(string)','function decimals() view returns(uint8)'],rpc);
   quotes.set(quote,quote===ZeroAddress?{quoteSymbol:'ETH',quoteDecimals:18}:{quoteSymbol:await q.symbol(),quoteDecimals:Number(await q.decimals())});
  }
  const c={manager:base.manager,managerCodeHash:base.managerCodeHash,token:base.token,token0,token1,quote,...quotes.get(quote),fee:Number(a.fee),tickSpacing:Number(a.tickSpacing),hook:getAddress(a.hooks),poolId:a.id,initializedAt:log.blockNumber,initializationHash:log.transactionHash};
  if(poolIdentity(c)!==c.poolId)throw Error('POOL_KEY_MISMATCH');pools.push(c);
 }
 const config={chainId:4663,token:base.token,verifiedAt:new Date().toISOString(),verifiedBlock:block.number,coverage:'Discovered Uniswap V4 pools; excludes V3 and newly created pools until rediscovery',pools};
 writeFileSync(new URL('./live-input-pools.json',import.meta.url),JSON.stringify(config,null,2));
 console.log(JSON.stringify({pools:pools.length,quotes:[...quotes.values()],verifiedBlock:block.number}));
}finally{rpc.destroy();}
