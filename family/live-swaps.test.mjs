import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,keccak256} from 'ethers';
import {collectLiveSwaps} from './lib/live-swaps.mjs';
import {poolIdentity,SWAP_ABI} from './lib/v4-input.mjs';
import {CURVE_ABI} from './lib/pons.mjs';
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0');
const abi=new Interface(SWAP_ABI),token=address(2),manager=address(9);
function fixture({badReceipt=false}={}){
 const pools=[0,3000].map(fee=>{const c={manager,managerCodeHash:keccak256('0x1234'),token,token0:address(1),token1:token,quoteSymbol:'USDG',quoteDecimals:6,fee,tickSpacing:200,hook:address(0)};return {...c,poolId:poolIdentity(c)};});
 const logs=pools.map((c,index)=>({address:manager,transactionHash:hash(777),index,blockNumber:1199,blockHash:hash(1199),...abi.encodeEventLog(abi.getEvent('Swap'),[c.poolId,address(3),-100n,200n,1n,1n,0,c.fee])}));
 const rpc={getNetwork:async()=>({chainId:4663}),getBlock:async n=>{const number=n==='latest'?1220:n;return {number,hash:hash(number),timestamp:Math.floor(Date.now()/1000)};},getCode:async()=>'0x1234',getLogs:async()=>logs,getTransactionReceipt:async()=>({status:1,blockHash:hash(1199),logs:badReceipt?logs.slice(1):logs})};
 return {rpc,config:{chainId:4663,token,pools}};
}
test('multi-pool bootstrap records history without creating live triggers',async()=>{
 let rows;await collectLiveSwaps({...fixture(),getCursor:()=>null,commit:r=>rows=r});
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.historical&&r.external&&!r.test));assert.notEqual(rows[0].id,rows[1].id);
});
test('a saved cursor marks newly confirmed swaps as live',async()=>{
 let rows,cursor;await collectLiveSwaps({...fixture(),getCursor:()=>({number:1198,hash:hash(1198)}),commit:(r,c)=>{rows=r;cursor=c;}});
 assert.ok(rows.every(r=>!r.historical&&r.sourceToken===token));assert.equal(cursor.number,1200);
});
test('a log absent from its receipt never advances the durable cursor',async()=>{
 let committed=false;await assert.rejects(()=>collectLiveSwaps({...fixture({badReceipt:true}),getCursor:()=>null,commit:()=>{committed=true;}}),/UNVERIFIED_TRADE/);assert.equal(committed,false);
});

test('official curve buys and sells share the cursor with graduation swaps',async()=>{
 const f=fixture(),curve=address(12),ca=new Interface(CURVE_ABI),v4=await f.rpc.getLogs();
 const curveLogs=['CurveBuy','CurveSell'].map((name,i)=>({address:curve,transactionHash:hash(778+i),index:4+i,blockNumber:1199,blockHash:hash(1199),...ca.encodeEventLog(ca.getEvent(name),[address(3),address(3),100n,200n,1n,0n])}));
 const all=[...v4,...curveLogs];f.config={...f.config,curve,curveCodeHash:keccak256('0x1234'),tokenCodeHash:keccak256('0x1234'),quoteSymbol:'GOOGL',quoteDecimals:18};
 f.rpc.getLogs=async filter=>filter.address===curve?curveLogs:v4;
 f.rpc.getTransactionReceipt=async()=>({status:1,blockHash:hash(1199),logs:all});
 let rows;const result=await collectLiveSwaps({...f,getCursor:()=>({number:1198,hash:hash(1198)}),commit:r=>rows=r});
 assert.equal(rows.length,4);assert.equal(result.adapter,'pons-curve-and-v4');
 assert.deepEqual(rows.slice(2).map(r=>[r.kind,r.quoteWei,r.quoteSymbol]),[['buy','100','GOOGL'],['sell','200','GOOGL']]);
 assert.ok(rows.every(r=>!r.historical&&!r.external&&r.sourceToken===token));
 f.config.curveCodeHash=hash(1);await assert.rejects(()=>collectLiveSwaps({...f,getCursor:()=>null,commit:()=>assert.fail('must not commit')}),/INPUT_CODE_CHANGED/);
});
