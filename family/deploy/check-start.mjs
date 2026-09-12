import {readFileSync,unlinkSync,existsSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
if(Number(process.versions.node.split('.')[0])<24)throw Error('NODE_24_REQUIRED');
for(const name of ['FAMILY_PYTHON','FAMILY_GRAPH','FAMILY_ANNOTATIONS','FAMILY_PRIOR_TX_FILE','FAMILY_PUBLISH_FILE']){
 if(!process.env[name]||!existsSync(process.env[name]))throw Error('MISSING_'+name);
}
if(!process.env.FAMILY_STATE_DIR)throw Error('STATE_DIRECTORY_REQUIRED');
const lock=resolve(process.env.FAMILY_STATE_DIR,'process.lock');
if(existsSync(lock)){
 if(!lstatSync(lock).isFile()||lstatSync(lock).isSymbolicLink())throw Error('INVALID_LOCK');
 const original=readFileSync(lock,'utf8');
 if(!/^[1-9][0-9]*$/.test(original.trim()))throw Error('INVALID_LOCK_PID');
 const pid=Number(original.trim());
 try{process.kill(pid,0);throw Error('WORKER_ALREADY_RUNNING');}
 catch(e){if(e.code!=='ESRCH')throw e;}
 // Only a demonstrably dead PID's exact lock is removed. Never touch the ledger.
 if(readFileSync(lock,'utf8')!==original)throw Error('LOCK_CHANGED');
 unlinkSync(lock);
}
console.log('Runtime prerequisites ready; signing remains disabled by the service unit.');
