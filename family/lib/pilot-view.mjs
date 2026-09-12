import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
import {publicBirth,tradeIdentity} from '../policy.mjs';
let cachedAt=0,cached=null;
export function readPilotView(root,now=Date.now()){if(now-cachedAt<40)return cached;cachedAt=now;cached=load(root,now);return cached;}
function load(root,now){
 try{
  let dir=resolve(root,'build/external-pilot');try{const a=JSON.parse(readFileSync(resolve(root,'build/family/active-browser.json')));if(/^[a-f0-9]{64}$/.test(a.id))dir=resolve(root,'build/live-pilots',a.id);}catch{}const s=JSON.parse(readFileSync(resolve(dir,'browser-state.json'))),b=JSON.parse(readFileSync(resolve(dir,'pilot.json')));
  if(now-Date.parse(s.asOf)>15000||!['opening','operator-terms','neural-cursor','awaiting-local-signature','submitted'].includes(s.status)||s.url!=='https://www.ponsfamily.com/launchpad/create')return null;
  const jpg=readFileSync(resolve(dir,'browser-frame.jpg'));if(jpg.length>250000||jpg[0]!==255||jpg[1]!==216)return null;
  return {birth:publicBirth(b),record:{...(b.event.sourceTrade??b.event),id:tradeIdentity(b.event.sourceTrade??b.event),historical:b.test===true,test:b.test===true},frame:'data:image/jpeg;base64,'+jpg.toString('base64'),camera:{status:'live',asOf:s.asOf,url:s.url},browserControl:{status:s.status,cursor:s.cursor,source:b.test?'external test replay':b.event?.external?'confirmed external input':'confirmed founder transaction',log:s.log.slice(-10)}};
 }catch{return null;}
}
