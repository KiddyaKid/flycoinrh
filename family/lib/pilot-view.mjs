import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
import {publicBirth,tradeIdentity} from '../policy.mjs';
export function readPilotView(root,now=Date.now()){
 try{
  const dir=resolve(root,'build/external-pilot'),s=JSON.parse(readFileSync(resolve(dir,'browser-state.json'))),b=JSON.parse(readFileSync(resolve(dir,'pilot.json')));
  if(now-Date.parse(s.asOf)>15000||!['neural-cursor','awaiting-local-signature','submitted'].includes(s.status)||b.test!==true||s.url!=='https://www.ponsfamily.com/launchpad/create')return null;
  const jpg=readFileSync(resolve(dir,'browser-frame.jpg'));if(jpg.length>250000||jpg[0]!==255||jpg[1]!==216)return null;
  return {birth:publicBirth(b),record:{...b.event,id:tradeIdentity(b.event),historical:true,test:true},frame:'data:image/jpeg;base64,'+jpg.toString('base64'),camera:{status:'live',asOf:s.asOf,url:s.url},browserControl:{status:s.status,cursor:s.cursor,source:'external test replay',log:s.log.slice(-10)}};
 }catch{return null;}
}
