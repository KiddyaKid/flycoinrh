import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEther,formatEther} from 'ethers';

export const SESSION_CAP_ETH='0.2';
export const sessionFile=()=>resolve(process.env.LOCALAPPDATA,'FlyFamily/launch-session.json');
export function validateSession(a,sessionId,now=Date.now()){
 if(a.schema!=='flyfamily.launch-session.v1'||!sessionId||a.id!==sessionId||a.chainId!==4663||a.budgetETH!==SESSION_CAP_ETH||!/^0x[\da-f]{40}$/i.test(a.owner??'')||!/^0x[\da-f]{40}$/i.test(a.sourceToken??'')||!/^\d+$/.test(a.baselineSpentWei??'')||!Number.isSafeInteger(a.baselineNonce)||a.baselineNonce<0||!Number.isFinite(Date.parse(a.startedAt))||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.startedAt)>now||Date.parse(a.expiresAt)-Date.parse(a.startedAt)>30*3600000)throw Error('LAUNCH_SESSION_INVALID');
 if(a.reconciledManualHashes&&(!Array.isArray(a.reconciledManualHashes)||a.reconciledManualHashes.some(h=>!/^0x[\da-f]{64}$/i.test(h))))throw Error('MANUAL_RECEIPTS_INVALID');
 if(a.sourceChangedAt&&(!Number.isFinite(Date.parse(a.sourceChangedAt))||Date.parse(a.sourceChangedAt)<Date.parse(a.startedAt)||Date.parse(a.sourceChangedAt)>now))throw Error('SOURCE_CHANGE_INVALID');
 if(a.paused)throw Error(a.pauseReason==='TOTAL_BUDGET_EXCEEDED'?'TOTAL_BUDGET_EXCEEDED':'LAUNCH_SESSION_PAUSED');
 if(!Array.isArray(a.receipts)||a.receipts.length!==a.baselineNonce||a.baselineNonce<1||a.receipts.some(r=>!/^0x[\da-f]{64}$/i.test(r.hash??'')||!/^0x[\da-f]{64}$/i.test(r.blockHash??'')||!Number.isSafeInteger(r.block)||!Number.isSafeInteger(r.nonce)||r.nonce<0||r.nonce>=a.baselineNonce||!/^\d+$/.test(r.costWei??''))||new Set(a.receipts.map(r=>r.nonce)).size!==a.baselineNonce||a.receipts.reduce((n,r)=>n+BigInt(r.costWei),0n)!==BigInt(a.baselineSpentWei))throw Error('SESSION_BASELINE_INVALID');
 if(now>=Date.parse(a.expiresAt))throw Error('LAUNCH_SESSION_EXPIRED');
 return a;
}
export function readSession(){return validateSession(JSON.parse(readFileSync(sessionFile(),'utf8')),process.env.FAMILY_LAUNCH_SESSION);}
export function checkSessionBirth(a,birth,owner){
 validateSession(a,a.id);
 if(a.owner.toLowerCase()!==owner.toLowerCase()||birth.sourceToken?.toLowerCase()!==a.sourceToken.toLowerCase()||birth.test||birth.event?.test||birth.event?.historical||!/^0x[\da-f]{64}$/i.test(birth.event?.hash??'')||!Number.isFinite(birth.event?.timestamp)||birth.event.timestamp<Date.parse(a.sourceChangedAt??a.startedAt)||!Number.isFinite(Date.parse(birth.createdAt))||Date.parse(birth.createdAt)<Date.parse(a.startedAt)||!['buy','sell','surge'].includes(birth.triggerKind)||!/^[\da-f]{64}$/.test(birth.id??''))throw Error('LIVE_ALLOWANCE_MISMATCH');
 return a;
}
export function sessionCost(a,spentWei,maximumWei){
 const used=BigInt(spentWei)-BigInt(a.baselineSpentWei),maximum=BigInt(maximumWei);
 if(used<0n||maximum<0n)throw Error('SESSION_SPEND_RECONCILIATION_REQUIRED');
 if(used+maximum>parseEther(a.budgetETH))throw Error('TOTAL_BUDGET_EXCEEDED');
 return {usedWei:String(used),remainingWei:String(parseEther(a.budgetETH)-used)};
}
export function pauseSession(reason){
 const a=readSession();a.paused=true;a.pauseReason=reason;
 writeFileSync(sessionFile()+'.tmp',JSON.stringify(a,null,2));renameSync(sessionFile()+'.tmp',sessionFile());
}
export function enforceLaunchBudget({birth,owner,spentWei,maximumWei}){
 if(!process.env.FAMILY_LAUNCH_SESSION){if(BigInt(spentWei)+BigInt(maximumWei)>parseEther('0.02'))throw Error('TOTAL_BUDGET_EXCEEDED');return;}
 const a=checkSessionBirth(readSession(),birth,owner);
 try{const cost=sessionCost(a,spentWei,maximumWei);writeFileSync(sessionFile()+'.usage.json',JSON.stringify({...cost,at:new Date().toISOString(),id:a.id}));}
 catch(e){if(e.message==='TOTAL_BUDGET_EXCEEDED')pauseSession(e.message);throw e;}
}
export function launchStatus(){
 if(process.env.FAMILY_OBSERVE_ONLY==='1')return {mode:'observation-only',reason:'Signing paused; live observation continues',signingPaused:true};
 if(!process.env.FAMILY_LAUNCH_SESSION)return {mode:'bounded-live-test',reason:'Legacy single-child allowance',signingPaused:false};
 try{const a=readSession();let usedETH=null;try{const u=JSON.parse(readFileSync(sessionFile()+'.usage.json'));if(u.id===a.id)usedETH=formatEther(u.usedWei);}catch{}
 return {mode:'bounded-live',reason:'Launch session: cumulative 0.2 ETH including fees and gas',signingPaused:false,budgetETH:a.budgetETH,usedETH,expiresAt:a.expiresAt,sessionId:a.id};
 }catch(e){return {mode:'observation-only',reason:e.message,signingPaused:true,budgetETH:SESSION_CAP_ETH};}
}
