import test from 'node:test';import assert from 'node:assert/strict';import {parseEther} from 'ethers';
import {validateSession,checkSessionBirth,sessionCost} from './lib/launch-session.mjs';
const now=Date.now(),a={schema:'flyfamily.launch-session.v1',id:'session-1',owner:'0x'+'1'.repeat(40),chainId:4663,sourceToken:'0x'+'2'.repeat(40),budgetETH:'0.2',baselineSpentWei:String(parseEther('0.08')),baselineNonce:1,receipts:[{hash:"0x"+"1".repeat(64),blockHash:"0x"+"2".repeat(64),block:100,nonce:0,costWei:String(parseEther("0.08"))}],startedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()};
const birth={id:'a'.repeat(64),createdAt:new Date(now).toISOString(),sourceToken:a.sourceToken,triggerKind:'buy',event:{timestamp:now,hash:'0x'+'b'.repeat(64)}};
test('session cap excludes prior costs and includes worst-case next fee, allowing exact boundary',()=>{
 assert.equal(sessionCost(a,parseEther('0.27'),parseEther('0.01')).remainingWei,String(parseEther('0.01')));
 assert.throws(()=>sessionCost(a,parseEther('0.27'),parseEther('0.010000000000000001')),/TOTAL_BUDGET/);
 assert.throws(()=>sessionCost(a,parseEther('0.079'),0n),/RECONCILIATION/);
});
test('expiry, explicit pause, changed session, raised cap and old trades fail closed',()=>{
 assert.equal(validateSession(a,a.id,now),a);
 assert.throws(()=>validateSession({...a,budgetETH:'0.21'},a.id,now));
 assert.throws(()=>validateSession(a,'other',now));
 assert.throws(()=>validateSession(a,a.id,now+120000),/EXPIRED/);
 assert.throws(()=>validateSession({...a,paused:true},a.id,now),/PAUSED/);
 for(const bad of [{test:true},{sourceToken:'0x'+'3'.repeat(40)},{event:{...birth.event,timestamp:now-2000}},{event:{...birth.event,historical:true}}])assert.throws(()=>checkSessionBirth(a,{...birth,...bad},a.owner));
});
test('multiple fresh births share one cumulative cap; failed gas and replacement maximum count',()=>{
 checkSessionBirth(a,birth,a.owner);checkSessionBirth(a,{...birth,id:'c'.repeat(64)},a.owner);
 // Prior successful launches plus reverted gas are all supplied in reconciled spend.
 assert.throws(()=>sessionCost(a,parseEther('0.279'),parseEther('0.002')),/TOTAL_BUDGET/);
 assert.equal(sessionCost(a,parseEther('0.279'),parseEther('0.001')).usedWei,String(parseEther('0.199')));
});
