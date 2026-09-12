import {Contract,Interface,ZeroAddress,keccak256,getAddress} from 'ethers';
import {FACTORY_ABI} from './pons.mjs';
import {CHILD_CREATOR_TAX_BPS} from './operator-policy.mjs';
import {enforceLaunchBudget} from './launch-session.mjs';
export async function prepareOffspring({birth,chain,owner,rpc,spentWei}){
 if(!['eligible','awaiting-signature'].includes(birth.status)||!/^[a-f0-9]{64}$/.test(birth.id))throw Error('BIRTH_NOT_READY');
 if(Number((await rpc.getNetwork()).chainId)!==chain.chainId||keccak256(await rpc.getCode(chain.factory))!==chain.factoryCodeHash)throw Error('FACTORY_OR_CHAIN_CHANGED');
 const factory=new Contract(chain.factory,FACTORY_ABI,rpc),configId=0;
 const [enabled,canLaunch,fee,config,maxTax,economics]=await Promise.all([factory.launchEnabled(),factory.canLaunch(owner),factory.launchFee(),factory.getLaunchConfig(configId),factory.maxCreatorTaxBps(),factory.previewLaunchEconomics(configId,ZeroAddress)]);
 if(!enabled||!canLaunch||!config.enabled||maxTax<BigInt(CHILD_CREATOR_TAX_BPS))throw Error('PONS_LAUNCH_UNAVAILABLE');
 const {name,symbol}=birth;if(!name||!symbol||!birth.naming?.fingerprint)throw Error('MEASURED_NAME_REQUIRED');
 const params={name,symbol,logo:'https://flyfamily.live/flyfamily-logo.jpg',description:`Digital offspring of ADAM and ATOM. Birth ${birth.id}. Uncalibrated MaleCNS model; not biological mating.`,socials:{twitter:'https://x.com/flyfamilyrh',telegram:'',discord:'',website:'https://flyfamily.live/',farcaster:''},creatorFeeRecipient:getAddress(owner),creatorTaxBps:CHILD_CREATOR_TAX_BPS,buybackEnabled:false,expectedEconomics:economics,salt:'0x'+birth.id};
 const tx={chainId:chain.chainId,from:getAddress(owner),to:chain.factory,value:fee,data:new Interface(FACTORY_ABI).encodeFunctionData('launchToken',[params,configId,ZeroAddress])};
 await rpc.call(tx);const estimate=await rpc.estimateGas(tx),fees=await rpc.getFeeData();const gasPrice=(fees.gasPrice??0n)*2n;if(!gasPrice)throw Error('GAS_UNAVAILABLE');const gasLimit=estimate*120n/100n,maximum=fee+gasLimit*gasPrice;
 enforceLaunchBudget({birth,owner,spentWei,maximumWei:maximum});
 if(await rpc.getBalance(owner)<maximum)throw Error('INSUFFICIENT_LAUNCH_BALANCE');
 return {tx:{...tx,gasLimit:gasLimit.toString(),gasPrice:gasPrice.toString(),value:fee.toString()},params,maximumWei:maximum.toString(),preparedAt:new Date().toISOString()};
}
export async function verifyOffspring({birth,chain,rpc,owner}){
 if(birth.status!=='submitted'||!birth.hash)return null;
 const r=await rpc.getTransactionReceipt(birth.hash);if(!r)return null;
 const head=await rpc.getBlock('latest');if(head.number-r.blockNumber<20)return null;
 if((await rpc.getBlock(r.blockNumber))?.hash!==r.blockHash)throw Error('DEPLOYMENT_REORGANIZED');
 const t=await rpc.getTransaction(birth.hash);if(!t||t.from!==getAddress(owner)||t.to!==getAddress(chain.factory)||t.data!==birth.prepared.tx.data||t.value!==BigInt(birth.prepared.tx.value))throw Error('DEPLOYMENT_MISMATCH');
 if(r.status!==1)return {status:'reverted',hash:birth.hash,feeWei:String(r.gasUsed*r.gasPrice),confirmedAt:new Date().toISOString()};
 const abi=new Interface(FACTORY_ABI),events=r.logs.filter(l=>l.address.toLowerCase()===chain.factory.toLowerCase()).map(l=>{try{return abi.parseLog(l);}catch{return null;}}).filter(e=>e?.name==='TokenLaunched');
 if(events.length!==1||events[0].args.deployer!==getAddress(owner)||events[0].args.pairToken!==ZeroAddress)throw Error('LAUNCH_EVENT_MISMATCH');
 const {token,curve}=events[0].args;
 const tok=new Contract(token,['function curve() view returns(address)','function launchFactory() view returns(address)'],rpc),cv=new Contract(curve,['function token() view returns(address)','function factory() view returns(address)','function deployer() view returns(address)','function creatorTaxBps() view returns(uint256)'],rpc);
 if(await rpc.getCode(token)==='0x'||await rpc.getCode(curve)==='0x'||await tok.curve()!==curve||await tok.launchFactory()!==getAddress(chain.factory)||await cv.token()!==token||await cv.factory()!==getAddress(chain.factory)||await cv.deployer()!==getAddress(owner)||await cv.creatorTaxBps()!==BigInt(CHILD_CREATOR_TAX_BPS))throw Error('CHILD_BINDING_MISMATCH');
 return {status:'confirmed',hash:birth.hash,token,curve,receiptVerified:true,block:r.blockNumber,blockHash:r.blockHash,feeWei:String(r.gasUsed*r.gasPrice),valueWei:String(t.value),confirmedAt:new Date().toISOString()};
}
