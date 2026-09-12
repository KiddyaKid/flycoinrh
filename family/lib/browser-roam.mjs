import {moveDecodedCursor} from './cursor-motion.mjs';
export const EXPLORE_URL='https://www.ponsfamily.com/launchpad';
// Read-only presentation policy. Random waypoints are never neural measurements.
export function browserRoam({page,onState,random=Math.random,now=Date.now}){
 let x=640,y=360,step=0,lastNavigation=now(),lastScroll=0;
 return async function tick(){
  if(!await page.locator('#family-cursor').count())await page.evaluate(({x,y})=>{
   const e=document.createElement('div');e.id='family-cursor';e.textContent='🪰';
   e.style.cssText=`position:fixed;left:${x}px;top:${y}px;font-size:30px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 0 4px white)`;document.body.append(e);
  },{x,y});
  const size=page.viewportSize()??{width:1280,height:720};
  const to={x:60+random()*(size.width-120),y:100+random()*(size.height-160)};
  await moveDecodedCursor(page,{x,y},to,900+Math.round(random()*500));x=to.x;y=to.y;step++;
  let action='hover';
  if(now()-lastScroll>7000){lastScroll=now();action='scroll';
   await page.evaluate(dir=>{const canScroll=e=>e.scrollHeight>e.clientHeight+80;
    const containers=[document.scrollingElement,...document.querySelectorAll('main,section,[class*="overflow-y"]')].filter(Boolean).filter(canScroll);
    const el=containers.at(-1);if(!el)return;const bottom=el.scrollTop+el.clientHeight>=el.scrollHeight-30;
    el.scrollBy({top:bottom?-Math.min(el.scrollTop,900):dir,behavior:'smooth'});
   },random()<.2?-280:360);
  }
  if(now()-lastNavigation>45000){
   const target=new URL(page.url()).pathname==='/launchpad'?'/':'/launchpad';
   // Follow only an actual observed first-party navigation link, never a trade button.
   const href=await page.locator('a[href]').evaluateAll((links,target)=>links.map(a=>a.href).find(h=>{try{const u=new URL(h);return u.hostname==='www.ponsfamily.com'&&u.pathname===target;}catch{return false;}}),target);
   if(href){await page.goto(href,{waitUntil:'domcontentloaded',timeout:20000});action='navigate';}
   lastNavigation=now();
  }
  onState({status:'exploring',mode:'ambient-read-only',asOf:new Date(now()).toISOString(),url:page.url(),cursor:{x,y,step,action,clickPermitted:false,assistance:'Random browsing policy; not decoded neural movement. No transactions are clicked in this mode.'}});
 };
}
