import {Contract,Interface,AbiCoder,keccak256} from 'ethers';
export const SWAP_ABI=['event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)'];
const abi=new Interface(SWAP_ABI);
export function poolIdentity(c){return keccak256(AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],[c.token0,c.token1,c.fee,c.tickSpacing,c.hook]));}
export function decodeSwap(log,c,block){
 if(log.address.toLowerCase()!==c.manager.toLowerCase()||poolIdentity(c)!==c.poolId||![c.token0,c.token1].includes(c.token))throw Error('INVALID_INPUT_POOL');
 const e=abi.parseLog(log);if(e?.name!=='Swap'||e.args.id!==c.poolId)throw Error('WRONG_POOL_SWAP');
 const target=c.token===c.token0?e.args.amount0:e.args.amount1,quote=c.token===c.token0?e.args.amount1:e.args.amount0;
 if(target===0n||quote===0n||(target>0n)===(quote>0n))throw Error('INVALID_SWAP_DELTAS');
 // V4 BalanceDelta: positive is received by the caller; negative is paid in.
 return {hash:log.transactionHash,index:log.index,kind:target>0n?'buy':'sell',quoteWei:String(quote<0n?-quote:quote),quoteSymbol:c.quoteSymbol,quoteDecimals:c.quoteDecimals,timestamp:block.timestamp*1000,block:block.number,blockHash:block.hash,sourceToken:c.token,sourcePool:c.poolId,test:true,inputMode:'verified-replay'};
}
export async function verifiedSwap(rpc,c,hash,index){
 if(Number((await rpc.getNetwork()).chainId)!==4663)throw Error('WRONG_CHAIN');
 const r=await rpc.getTransactionReceipt(hash),head=await rpc.getBlock('latest');
 if(r?.status!==1||head.number-r.blockNumber<20)throw Error('UNCONFIRMED_INPUT');
 const b=await rpc.getBlock(r.blockNumber);if(b.hash!==r.blockHash)throw Error('REORGANIZED_INPUT');const tag={blockTag:b.number};
 for(const k of ['manager','hook','token','factory','quote'])if(keccak256(await rpc.getCode(c[k],b.number))!==c[k+'CodeHash'])throw Error('INPUT_CODE_CHANGED');
 const f=new Contract(c.factory,['function poolManager() view returns(address)','function memeHook() view returns(address)','function getLaunchedToken(address) view returns(tuple(address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists))'],rpc);
 const t=await f.getLaunchedToken(c.token,tag);
 if(!t.exists||Number(t.phase)!==2||t.token!==c.token||t.pairToken!==c.quote||Number(t.poolFee)!==c.fee||Number(t.tickSpacing)!==c.tickSpacing||await f.poolManager(tag)!==c.manager||await f.memeHook(tag)!==c.hook)throw Error('POOL_BINDING_CHANGED');
 const q=new Contract(c.quote,['function symbol() view returns(string)','function decimals() view returns(uint8)'],rpc);
 if(await q.symbol(tag)!==c.quoteSymbol||Number(await q.decimals(tag))!==c.quoteDecimals)throw Error('QUOTE_CHANGED');
 const log=r.logs.find(l=>l.index===index&&l.address.toLowerCase()===c.manager.toLowerCase());if(!log)throw Error('INPUT_LOG_MISSING');return decodeSwap(log,c,b);
}
