import {createHash} from 'node:crypto';
export const VERSION='flyfamily.market-birth.v2';
export const COOLDOWN_MS=60000;
export const MAX_PENDING=8;
export const X_URL='https://x.com/flyfamilyrh';
export const LOGO_URL='https://flyfamily.live/flyfamily-logo.jpg';
export const digest=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export function tradeIdentity(t){
 if(!/^0x[a-fA-F0-9]{64}$/.test(t.hash)||!Number.isSafeInteger(t.index)||t.index<0||!['buy','sell'].includes(t.kind)||!/^\d+$/.test(t.quoteWei)||!Number.isSafeInteger(t.timestamp))throw Error('INVALID_TRADE');
 return `4663:${t.hash.toLowerCase()}:${t.index}`;
}
// A surge is an additional, once-per-minute event. Its baseline excludes the current bucket.
export function volumeSurge(trades,now){
 const bucket=Math.floor(now/60000),start=bucket*60000;
 const prior=trades.filter(t=>t.timestamp>=start-300000&&t.timestamp<start);
 const recent=trades.filter(t=>t.timestamp>=start&&t.timestamp<=now);
 const sum=rows=>rows.reduce((n,t)=>n+BigInt(t.quoteWei),0n);
 const amount=sum(recent),baseline=sum(prior)/5n;
 return recent.length>=4&&prior.length>=5&&amount>=1000000000000000n&&amount>=baseline*3n
  ?{id:`surge:${bucket}`,kind:'surge',timestamp:now,quoteWei:String(amount),baselineWei:String(baseline),tradeIds:recent.map(tradeIdentity)}:null;
}
export function neuralName(readout){
 if(!readout||readout.neurons!==165122||!/^([a-f0-9]{64})$/.test(readout.graphSha256)||readout.parents?.length!==2)throw Error('NEURAL_PROVENANCE_REQUIRED');
 for(const p of readout.parents)if(!Number.isFinite(p.active)||!p.rates||Object.values(p.rates).some(v=>!Number.isFinite(v)))throw Error('INVALID_NEURAL_READOUT');
 const fingerprint=digest({graphSha256:readout.graphSha256,neurons:readout.neurons,kind:readout.kind??'vision',parents:readout.parents.map(p=>({id:p.id,seed:p.seed,active:p.active,rates:p.rates}))}),a=['Aero','Mica','Nero','Vela','Echo','Luma','Oro','Kiro','Soma','Nova','Iris','Cera','Astra','Nima','Pico','Zeno'],b=['wing','moth','cell','loop','veil','spark','drift','wave','seed','phase','glint','node','pulse','glass','coil','bloom'];
 const label=a[parseInt(fingerprint[0],16)]+b[parseInt(fingerprint[1],16)];
 return {name:`${label} ${fingerprint.slice(2,6).toUpperCase()}`,symbol:`${label.slice(0,4).toUpperCase()}${fingerprint.slice(2,6).toUpperCase()}`,fingerprint,method:'sha256 of measured two-seed readout → fixed syllable vocabulary; not language comprehension'};
}
export function nextEgg({event,readout,parents=['adam','atom'],ordinal=1}){
 const identity=event.kind==='surge'?event.id:tradeIdentity(event),id=digest(`${VERSION}:${identity}`),naming=neuralName(readout);
 return {id,status:'eligible',createdAt:new Date().toISOString(),triggerId:identity,triggerKind:event.kind,tradeHash:event.hash??null,parents,generation:1,ordinal,naming,name:`${naming.name} #${ordinal}`,symbol:`${naming.symbol.slice(0,7)}${ordinal}`,genome:{sourceGraphSha256:readout.graphSha256,seed:parseInt(naming.fingerprint.slice(0,8),16),parameters:'Same MaleCNS anatomy and reference parameters; new stochastic seed',mutationCount:0},assaySha256:digest(readout),ruleVersion:VERSION};
}
export function canStartEgg(births,now){return !births.some(b=>['eligible','awaiting-signature','submitted'].includes(b.status))&&(!births.length||now-Date.parse(births.at(-1).createdAt)>=COOLDOWN_MS);}
export function publicBirth(b){const {id,status,createdAt,confirmedAt,triggerKind,tradeHash,parents,generation,ordinal,name,symbol,genome,naming,hash,token,receiptVerified,preparationError}=b;return {id,status,createdAt,confirmedAt,triggerKind,tradeHash,parents,generation,ordinal,name,symbol,genome,naming,hash,token,receiptVerified,preparationError};}
