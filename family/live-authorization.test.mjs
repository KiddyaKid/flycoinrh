import test from 'node:test';import assert from 'node:assert/strict';
import {checkLiveAllowance} from './lib/live-authorization.mjs';
import {rawLogoCid} from './lib/logo-attestation.mjs';
import {readFileSync} from 'node:fs';
const owner='0x123',now=Date.now(),a={owner,chainId:4663,maxLaunches:1,budgetETH:'0.02',sourceToken:'0xabc',startedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+10000).toISOString()},b={id:'a'.repeat(64),createdAt:new Date(now).toISOString(),sourceToken:'0xabc',triggerKind:'buy',event:{timestamp:now,hash:'0x'+'1'.repeat(64)}};
test('live allowance binds exactly one birth and excludes replay',()=>{
 const bound=checkLiveAllowance(a,b,owner,now);assert.equal(bound.boundBirthId,b.id);
 assert.throws(()=>checkLiveAllowance(bound,{...b,id:'b'.repeat(64)},owner,now));
 assert.throws(()=>checkLiveAllowance(a,{...b,test:true},owner,now));
 assert.throws(()=>checkLiveAllowance(a,{...b,event:{...b.event,historical:true}},owner,now));
 assert.throws(()=>checkLiveAllowance(a,{...b,sourceToken:'0xother'},owner,now));
 assert.throws(()=>checkLiveAllowance(a,b,owner,now+20000));
});
test('fixed logo produces the already verified raw content identifier',()=>{
 const logo=rawLogoCid(readFileSync(new URL('../assets/flyfamily-logo.jpg',import.meta.url)));
 assert.equal(logo.url,'ipfs://bafkreigwndamz2iz63bg4lgnt7bzxa5odjvdyziz23y5qcd5pwgvlco7pe');
});
