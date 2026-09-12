import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {provider} from './lib/pons.mjs';import {prepareOffspring} from './lib/offspring-deploy.mjs';import {nextEgg,LOGO_URL,X_URL} from './policy.mjs';import assert from 'node:assert/strict';
const state=await fetch('http://127.0.0.1:5190/state').then(r=>r.json());assert(state.frame?.startsWith('data:image/jpeg;base64,'));
const frame=resolve('../build/family/rehearsal.jpg');writeFileSync(frame,Buffer.from(state.frame.split(',')[1],'base64'));
const p=spawn(process.env.FAMILY_PYTHON??'python',['brain.py'],{cwd:import.meta.dirname,stdio:['pipe','pipe','pipe']});let waiter=null;
createInterface({input:p.stdout}).on('line',line=>{const r=JSON.parse(line);if(waiter){const w=waiter;waiter=null;r.error?w.reject(Error(r.error)):w.resolve(r);}});p.stderr.on('data',()=>{});p.on('exit',()=>waiter?.reject(Error('BRAIN_EXIT')));
const rpc=provider(JSON.parse(readFileSync('chain.json')).rpcUrl),chain=JSON.parse(readFileSync('chain.json'));
const report=[];
try{for(const [i,kind] of ['buy','sell','surge'].entries()){
 const neural=await new Promise((resolve,reject)=>{waiter={resolve,reject};p.stdin.write(JSON.stringify({id:'rehearsal-'+kind,frame,kind})+'\n');});
 const e={id:'surge:rehearsal',hash:chain.recordedTradeHashes[0],index:i,kind,quoteWei:'0',timestamp:Date.now()},birth=nextEgg({event:e,readout:neural,ordinal:i+1});
 const prepared=await prepareOffspring({birth,chain,owner:process.env.FAMILY_OPERATOR_ADDRESS??'0x9ca6276184a59d23ef97e1cd06c02c4a6af3322c',rpc,spentWei:0n});
 assert.equal(prepared.params.logo,LOGO_URL);assert.equal(prepared.params.socials.twitter,X_URL);assert.equal(prepared.params.creatorTaxBps,0);assert.equal(prepared.params.name,birth.name);
 report.push({kind,name:birth.name,neural,naming:birth.naming,gasEstimateMaximumWei:prepared.maximumWei,preparedOnly:true,notPublished:true});
 console.log(JSON.stringify({kind,name:birth.name,neurons:neural.neurons,active:neural.parents.map(p=>p.active),preparedOnly:true}));
}writeFileSync('../build/family/rehearsal.json',JSON.stringify(report,null,2));}finally{p.kill();rpc.destroy();}
