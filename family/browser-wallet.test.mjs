import test from 'node:test';import assert from 'node:assert/strict';import {ZeroAddress,keccak256,parseEther} from 'ethers';
import {PAGE_ABI,inspectPageRequest,preparePageRequest} from './lib/browser-wallet.mjs';
const owner='0x0000000000000000000000000000000000000001',factory='0x0000000000000000000000000000000000000002',chain={chainId:4663,factory},birth={name:'Pilot',symbol:'TEST',prepared:{params:{description:'Test'}}};
const p={name:'Pilot',symbol:'TEST',description:'Test',logo:'https://flyfamily.live/flyfamily-logo.jpg',socials:{twitter:'https://x.com/flyfamilyrh',telegram:'',discord:'',website:'',farcaster:''},creatorFeeRecipient:owner,creatorTaxBps:0,buybackEnabled:false,expectedEconomics:'0x'+'0'.repeat(64),salt:'0x'+'1'.repeat(64)};
const signature=PAGE_ABI.fragments.find(f=>f.type==='function'&&f.name==='launchToken'&&f.inputs.length===3).format();
const tx=(params=p)=>({from:owner,to:factory,chainId:'0x1237',value:'0x1',data:PAGE_ABI.encodeFunctionData(signature,[params,0,ZeroAddress])});
test('accepts a matching page-generated launch payload',()=>assert.equal(inspectPageRequest(tx(),birth,chain,owner).name,'Pilot'));
test('rejects changed fee recipient',()=>assert.throws(()=>inspectPageRequest(tx({...p,creatorFeeRecipient:factory}),birth,chain,owner),/ECONOMICS/));
test('rejects additional creator tax',()=>assert.throws(()=>inspectPageRequest(tx({...p,creatorTaxBps:100}),birth,chain,owner),/ECONOMICS/));
test('rejects another factory and X handle',()=>{assert.throws(()=>inspectPageRequest({...tx(),to:owner},birth,chain,owner),/WALLET/);assert.throws(()=>inspectPageRequest(tx({...p,socials:{...p.socials,twitter:'https://x.com/other'}}),birth,chain,owner),/SOCIALS/);});
test('gas headroom survives a base-fee increase while cumulative budget remains enforced',async()=>{
 const rpc={getNetwork:async()=>({chainId:4663}),getCode:async()=>'0x6000',getFeeData:async()=>({gasPrice:100000000n}),estimateGas:async()=>100000n,call:async request=>{const f=PAGE_ABI.parseTransaction({data:request.data});return f.name==='launchFee'?PAGE_ABI.encodeFunctionResult('launchFee',[1n]):f.name==='previewLaunchEconomics'?PAGE_ABI.encodeFunctionResult('previewLaunchEconomics',[p.expectedEconomics]):'0x';}};
 const args={tx:tx(),birth,chain:{...chain,factoryCodeHash:keccak256('0x6000')},owner,rpc,spentWei:0n,verifiedLogo:p.logo};
 const ready=await preparePageRequest(args);assert.equal(ready.tx.gasPrice,'200000000');assert.equal(ready.tx.gasLimit,'120000');assert.equal(BigInt(ready.maximumWei),24000000000001n);
 await assert.rejects(()=>preparePageRequest({...args,spentWei:parseEther('0.01999')}),/TOTAL_BUDGET_EXCEEDED/);
});
