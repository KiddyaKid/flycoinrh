import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
export function checkScope(scope,birth,owner,now=Date.now()){
 if(scope.owner?.toLowerCase()!==owner.toLowerCase()||scope.chainId!==4663||scope.birthId!==birth.id||scope.maxLaunches!==1||scope.budgetETH!=='0.02'||!Number.isFinite(Date.parse(scope.expiresAt))||Date.parse(scope.expiresAt)<=now)throw Error('LOCAL_SIGNER_SCOPE_MISMATCH');
}
export async function localKey(birth,owner){
 if(process.platform!=='win32')throw Error('WINDOWS_SIGNER_REQUIRED');
 checkScope(JSON.parse(readFileSync(resolve(process.env.LOCALAPPDATA,'FlyFamily/scope.json'),'utf8').replace(/^\uFEFF/,'')),birth,owner);
 return new Promise((ok,fail)=>{
  const child=spawn('powershell.exe',['-NoProfile','-File',resolve(import.meta.dirname,'../key-decrypt.ps1')],{windowsHide:true,stdio:['ignore','pipe','ignore']});let key='';
  child.stdout.on('data',b=>{key+=b;if(key.length>100)child.kill();});
  child.on('error',()=>{key='';fail(Error('LOCAL_KEY_UNAVAILABLE'));});
  child.on('close',code=>{const value=key.trim();key='';if(code||!/^(0x)?[0-9a-fA-F]{64}$/.test(value))fail(Error('LOCAL_KEY_UNAVAILABLE'));else ok(value);});
 });
}
