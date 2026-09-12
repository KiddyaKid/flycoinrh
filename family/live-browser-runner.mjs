// One bounded live birth. The PONS page must request the transaction itself.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const dir=process.env.FAMILY_PILOT_DIR,children=[];
if(!dir||process.env.FAMILY_LIVE_TEST!=='1')throw Error('LIVE_RUN_NOT_CONFIGURED');
const child=file=>{const p=spawn(process.execPath,[resolve(import.meta.dirname,file)],{cwd:resolve(import.meta.dirname,'..'),windowsHide:true,stdio:['ignore','ignore','pipe']});p.stderr.on('data',()=>{});p.on('exit',(code,signal)=>{writeFileSync(resolve(dir,file+'.exit.json'),JSON.stringify({code,signal,asOf:new Date().toISOString()}));});children.push(p);return p;};
let finished=false;
try{
 const browser=child('browser-pilot.mjs'),signer=child('auto-sign.mjs');
 browser.on('error',()=>{finished=true;});signer.on('error',()=>{finished=true;});
 const deadline=Date.now()+12*60000;
 while(!finished&&Date.now()<deadline){
  const b=JSON.parse(readFileSync(resolve(dir,'pilot.json')));
  if(['confirmed','reverted'].includes(b.status)){finished=true;await new Promise(r=>setTimeout(r,15000));break;}
  if(browser.exitCode!==null||signer.exitCode!==null){break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 const b=JSON.parse(readFileSync(resolve(dir,'pilot.json')));
 if(!['confirmed','reverted','submitted'].includes(b.status)){
  b.preparationError='LIVE_BROWSER_CHECK_REQUIRED';
  const db=new DatabaseSync(resolve(process.env.FAMILY_STATE_DIR,'ledger.sqlite'));
  try{db.prepare('UPDATE births SET payload=? WHERE id=?').run(JSON.stringify(b),b.id);db.prepare('INSERT INTO journal(at,kind,detail,hash) VALUES(?,?,?,?)').run(new Date().toISOString(),'paused','Browser execution needs review',b.tradeHash);}finally{db.close();}
 }
 writeFileSync(resolve(dir,'runner-result.json'),JSON.stringify({status:b.status,hash:b.hash??null,asOf:new Date().toISOString()}));
}finally{for(const p of children)p.kill();}
