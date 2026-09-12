import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,keccak256} from 'ethers';
import {collectLiveSwaps} from './lib/live-swaps.mjs';
import {poolIdentity,SWAP_ABI} from './lib/v4-input.mjs';
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
