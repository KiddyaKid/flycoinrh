import {Contract,AbiCoder,keccak256,Interface} from 'ethers';
import {readFileSync,writeFileSync} from 'node:fs';
import {provider} from './lib/pons.mjs';
const chain=JSON.parse(readFileSync(new URL('./chain.json',import.meta.url))),rpc=provider(chain.rpcUrl);
try{
 const token='0x4Eb990547BCe4a982432CA88Cf5fae7EED1A2d35',factory=chain.factory;
 const f=new Contract(factory,['function poolManager() view returns(address)','function memeHook() view returns(address)','function getLaunchedToken(address) view returns(tuple(address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists))'],rpc);
 const block=await rpc.getBlock('latest'),tag={blockTag:block.number};
 const [launch,manager,hook]=await Promise.all([f.getLaunchedToken(token,tag),f.poolManager(tag),f.memeHook(tag)]);
 if(!launch.exists||Number(launch.phase)!==2)throw Error('TOKEN_NOT_GRADUATED '+launch.phase);
 const currencies=[token,launch.pairToken].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())),quote=launch.pairToken;
 const key=[...currencies,Number(launch.poolFee),Number(launch.tickSpacing),hook],poolId=keccak256(AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],key));
 const q=new Contract(quote,['function symbol() view returns(string)','function decimals() view returns(uint8)'],rpc);
 const c={chainId:4663,token,factory,manager,hook,quote,token0:currencies[0],token1:currencies[1],poolId,fee:key[2],tickSpacing:key[3],quoteSymbol:await q.symbol(tag),quoteDecimals:Number(await q.decimals(tag)),verifiedBlock:block.number};
 for(const k of ['token','factory','manager','hook','quote'])c[k+'CodeHash']=keccak256(await rpc.getCode(c[k],block.number));
 const abi=new Interface(['event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)']);
 let logs=[];for(let end=block.number-20;end>block.number-20000&&!logs.length;end-=2000)logs=await rpc.getLogs({address:manager,topics:[abi.getEvent('Swap').topicHash,poolId],fromBlock:end-1999,toBlock:end});
 if(!logs.length)throw Error('NO_RECENT_SWAPS');
 const last=logs.at(-1);c.sample={hash:last.transactionHash,index:last.index,block:last.blockNumber};
 writeFileSync(new URL('./external-flybrain.json',import.meta.url),JSON.stringify(c,null,2)+'\n');
 console.log(JSON.stringify({config:c,swapsInRange:logs.length,last:abi.parseLog(last).args},(_,v)=>typeof v==='bigint'?String(v):v,2));
}finally{rpc.destroy();}
