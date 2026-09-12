import {Contract,Interface,getAddress,ZeroAddress,keccak256} from 'ethers';
import {FACTORY_ABI} from './pons.mjs';
import {CHILD_CREATOR_TAX_BPS} from './operator-policy.mjs';
import {enforceLaunchBudget} from './launch-session.mjs';
const launch=FACTORY_ABI.find(s=>s.startsWith('function launchToken('));
const overload=launch.replace('address pairToken)','address pairToken,address[] snipeTaxExemptions)');
export const PAGE_ABI=new Interface([...FACTORY_ABI,overload]);
export function inspectPageRequest(tx,birth,chain,owner){
 if(getAddress(tx.from)!==getAddress(owner)||getAddress(tx.to)!==getAddress(chain.factory)||(tx.chainId&&BigInt(tx.chainId)!==BigInt(chain.chainId)))throw Error('PAGE_WALLET_OR_CHAIN_MISMATCH');
 const decoded=PAGE_ABI.parseTransaction({data:tx.data,value:tx.value});
 if(decoded?.name!=='launchToken')throw Error('ONLY_TOKEN_LAUNCH_ALLOWED');
 const [p,config,pair,exemptions]=decoded.args;
 if(config!==0n||pair!==ZeroAddress||(exemptions&&exemptions.length))throw Error('UNEXPECTED_LAUNCH_OPTIONS');
 if(p.name!==birth.name||p.symbol!==birth.symbol||p.description!==birth.prepared.params.description)throw Error('PAGE_METADATA_MISMATCH');
 if(getAddress(p.creatorFeeRecipient)!==getAddress(owner)||p.creatorTaxBps!==BigInt(CHILD_CREATOR_TAX_BPS)||p.buybackEnabled)throw Error('PAGE_ECONOMICS_MISMATCH');
 if(p.socials.twitter!=='https://x.com/flyfamilyrh'||p.socials.telegram||p.socials.discord||p.socials.farcaster||!['','https://flyfamily.live/'].includes(p.socials.website))throw Error('PAGE_SOCIALS_MISMATCH');
 return p;
}
export async function preparePageRequest({tx,birth,chain,owner,rpc,spentWei,verifiedLogo}){
 const p=inspectPageRequest(tx,birth,chain,owner);
 if(p.logo!==verifiedLogo)throw Error('UNVERIFIED_UPLOADED_LOGO');
 if(Number((await rpc.getNetwork()).chainId)!==chain.chainId||keccak256(await rpc.getCode(chain.factory))!==chain.factoryCodeHash)throw Error('FACTORY_OR_CHAIN_CHANGED');
 const f=new Contract(chain.factory,FACTORY_ABI,rpc),[fee,economics]=await Promise.all([f.launchFee(),f.previewLaunchEconomics(0,ZeroAddress)]);
 if(BigInt(tx.value)!==fee||p.expectedEconomics!==economics)throw Error('PAGE_FEE_OR_ECONOMICS_CHANGED');
 const clean={chainId:chain.chainId,from:getAddress(owner),to:getAddress(chain.factory),data:tx.data,value:fee};
 await rpc.call(clean);const estimate=await rpc.estimateGas(clean),gasPrice=((await rpc.getFeeData()).gasPrice??0n)*2n;if(!gasPrice)throw Error('GAS_UNAVAILABLE');
 const gasLimit=estimate*120n/100n,maximumWei=fee+gasLimit*gasPrice;
 enforceLaunchBudget({birth,owner,spentWei,maximumWei});
 if(await rpc.getBalance(owner)<maximumWei)throw Error('INSUFFICIENT_LAUNCH_BALANCE');
 return {tx:{...clean,value:String(fee),gasPrice:String(gasPrice),gasLimit:String(gasLimit)},maximumWei:String(maximumWei),source:'PONS browser eth_sendTransaction',preparedAt:new Date().toISOString()};
}
