import {writeFileSync,renameSync} from 'node:fs';
// Windows readers / antivirus may briefly deny replacing an open JSON record.
// Keep the prepared record and retry the same rename; never remove its target.
export function writeAtomicRecord(file,value){
 writeFileSync(file+'.tmp',JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2));
 for(let i=0;;i++)try{renameSync(file+'.tmp',file);return;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||i>=15)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}
}
