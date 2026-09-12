export function visualReference(v){if(!v)return undefined;const {crop,scene,on,off,...reference}=v;return reference;}
export function compactDossier(d){return d?.vision?{...d,vision:visualReference(d.vision)}:d;}
export function boundFieldSnapshot(s,maxBytes=480000){
 s.records=s.records.map(r=>r.dossier?{...r,dossier:compactDossier(r.dossier)}:r);
 s.measuredRecords=(s.measuredRecords??[]).map(compactDossier);
 s.observations=[...(s.observations??[])];
 while(s.observations.length&&Buffer.byteLength(JSON.stringify(s))>maxBytes)s.observations.pop();
 return s;
}
