import test from 'node:test';import assert from 'node:assert/strict';import {reconcileWalletSpend} from './lib/wallet-spend.mjs';
const session={baselineSpentWei:'100',baselineNonce:1,receipts:[{hash:'old',block:5,blockHash:'anchor'}]},owner='owner';
function rpc({nonce=2,status=1,canonical=true}={}){return {getTransactionCount:async()=>nonce,getBlock:async n=>({hash:n===5?(canonical?'anchor':'changed'):'new-block'}),getTransactionReceipt:async()=>({blockNumber:10,blockHash:'new-block',gasUsed:3n,gasPrice:2n,status}),getTransaction:async()=>({from:owner,nonce:1,value:20n})};}
test('reconciles session spend from anchored baseline and new receipts',async()=>assert.equal(await reconcileWalletSpend({rpc:rpc(),owner,hashes:['old','new'],session}),126n));
test('a reverted transaction charges gas, not its reverted value',async()=>assert.equal(await reconcileWalletSpend({rpc:rpc({status:0}),owner,hashes:['old','new'],session}),106n));

test('explicitly reconciled manual receipts count toward the original session cap',async()=>{
 assert.equal(await reconcileWalletSpend({rpc:rpc(),owner,hashes:['old'],session:{...session,reconciledManualHashes:['new']}}),126n);
 await assert.rejects(()=>reconcileWalletSpend({rpc:rpc({nonce:3}),owner,hashes:['old'],session:{...session,reconciledManualHashes:['new']}}),/NONCES/);
});
test('concurrent manual nonce and baseline reorg both block signing',async()=>{
 await assert.rejects(()=>reconcileWalletSpend({rpc:rpc({nonce:3}),owner,hashes:['new'],session}),/NONCES/);
 await assert.rejects(()=>reconcileWalletSpend({rpc:rpc({canonical:false}),owner,hashes:['new'],session}),/REORGANIZED/);
});
