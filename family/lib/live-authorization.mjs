import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {readSession,checkSessionBirth} from './launch-session.mjs';
export function checkLiveAllowance(a,birth,owner,now=Date.now()){
 if(a.owner?.toLowerCase()!==owner.toLowerCase()||a.chainId!==4663||a.maxLaunches!==1||a.budgetETH!=='0.02'||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=now||!Number.isFinite(Date.parse(a.startedAt))||!Number.isFinite(Date.parse(birth.createdAt))||Date.parse(birth.createdAt)<Date.parse(a.startedAt)||birth.test||birth.event?.historical||birth.event?.test||!/^0x[a-fA-F0-9]{64}$/.test(birth.event?.hash??'')||!Number.isFinite(birth.event?.timestamp)||birth.event.timestamp<Date.parse(a.startedAt)||birth.sourceToken?.toLowerCase()!==a.sourceToken?.toLowerCase()||!['buy','sell','surge'].includes(birth.triggerKind)||!birth.id||a.boundBirthId&&a.boundBirthId!==birth.id)throw Error('LIVE_ALLOWANCE_MISMATCH');
 return {...a,boundBirthId:birth.id};
}
export function bindLiveAllowance(birth,owner){
 if(process.env.FAMILY_LAUNCH_SESSION)return checkSessionBirth(readSession(),birth,owner);
 const file=resolve(process.env.LOCALAPPDATA,'FlyFamily/next-live-test.json');
 const allowance=checkLiveAllowance(JSON.parse(readFileSync(file,'utf8')),birth,owner);
 writeFileSync(file+'.tmp',JSON.stringify(allowance));renameSync(file+'.tmp',file);
 return allowance;
}
