import {readFileSync,writeFileSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const dir=resolve(process.env.FAMILY_PILOT_DIR??resolve(import.meta.dirname,'../build/external-pilot')),lockFile=resolve(dir,'auto-sign.lock');
const lock=openSync(lockFile,'wx');writeFileSync(lock,String(process.pid));
function state(status){writeFileSync(resolve(dir,'auto-sign-state.json'),JSON.stringify({status,asOf:new Date().toISOString(),pid:process.pid}));}
try{
 const deadline=Date.now()+7*24*3600000;
 let recoveryAttempts=0,reprice=false;
 while(Date.now()<deadline){
  const birth=JSON.parse(readFileSync(resolve(dir,'pilot.json')));
  if(birth.status==='confirmed'){state('confirmed');break;}
  const requestFile=resolve(dir,'browser-request.json');
  if(existsSync(requestFile)&&!existsSync(resolve(dir,'browser-sign.lock'))){
   const req=JSON.parse(readFileSync(requestFile));
   if(req.birthId===birth.id&&(birth.hash||Date.now()-Date.parse(req.requestedAt)<600000)){
    state('checking-and-signing');
    const code=await new Promise(ok=>{const p=spawn(process.execPath,[resolve(import.meta.dirname,'browser-sign.mjs'),'--auto',...(reprice?['--reprice']:[])],{windowsHide:true,stdio:'ignore'});p.on('error',()=>ok(1));p.on('close',ok);});
    if(code){
     const saved=JSON.parse(readFileSync(resolve(dir,'pilot.json')));
     if(saved.hash&&existsSync(resolve(dir,'browser-signed-tx'))&&recoveryAttempts++<3){const failure=JSON.parse(readFileSync(resolve(dir,'signer-status.json')));reprice=failure.rpcCode===-32000&&/max fee per gas less than block base fee/.test(failure.rpcMessage??'');state(reprice?'repricing-same-nonce-within-budget':'reconciling-same-signed-transaction');await new Promise(r=>setTimeout(r,5000));continue;}
     state('stopped-check-failed');break;
    }
    if(JSON.parse(readFileSync(resolve(dir,'pilot.json'))).status==='confirmed'){state('confirmed');break;}
   }else state('waiting-for-fresh-page-request');
  }else state('waiting-for-page-request');
  await new Promise(r=>setTimeout(r,5000));
 }
}finally{closeSync(lock);unlinkSync(lockFile);}
