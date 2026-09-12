import test from 'node:test';import assert from 'node:assert/strict';import {Interface} from 'ethers';import {readFileSync} from 'node:fs';import {SWAP_ABI,decodeSwap} from './lib/v4-input.mjs';
const c=JSON.parse(readFileSync(new URL('./external-flybrain.json',import.meta.url))),abi=new Interface(SWAP_ABI);
function log(a,b,pool=c.poolId){return {...abi.encodeEventLog(abi.getEvent('Swap'),[pool,c.factory,a,b,1n,1n,0,0]),address:c.manager,transactionHash:'0x'+'a'.repeat(64),index:3};}
const block={number:10,hash:'0x'+'b'.repeat(64),timestamp:100};
test('V4 positive FLYBRAIN output is a buy; GOOGL units preserved',()=>{const e=decodeSwap(log(-5n,100n),c,block);assert.equal(e.kind,'buy');assert.equal(e.quoteWei,'5');assert.equal(e.quoteSymbol,'GOOGL');});
test('V4 negative FLYBRAIN input is a sell',()=>assert.equal(decodeSwap(log(5n,-100n),c,block).kind,'sell'));
test('other singleton pool cannot trigger this source',()=>assert.throws(()=>decodeSwap(log(-5n,100n,'0x'+'1'.repeat(64)),c,block),/WRONG_POOL/));
test('same-sign deltas rejected',()=>assert.throws(()=>decodeSwap(log(5n,100n),c,block),/INVALID_SWAP/));
