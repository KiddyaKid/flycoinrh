import {moveDecodedCursor} from './cursor-motion.mjs';
export const EXPLORE_URL='https://flyfamily.live/field-guide.html?scene=reading';
export const FIELD_TASKS=[
 {id:'reading',title:'Shakespeare / a life in verse',url:EXPLORE_URL},
 {id:'source',title:'Reading the source / Sonnet XVIII',url:'https://shakespeare.mit.edu/Poetry/sonnet.XVIII.html'},
 {id:'contrast',title:'Light lab / change the image',url:'https://flyfamily.live/field-guide.html?scene=contrast'},
 {id:'motion',title:'Signal garden / moving light',url:'https://flyfamily.live/field-guide.html?scene=motion'},
 {id:'lineage',title:'Family atlas / a shared origin',url:'https://flyfamily.live/field-guide.html?scene=lineage'},
];
export const allowedFieldUrl=url=>{try{const u=new URL(url);return FIELD_TASKS.some(t=>t.url===u.href);}catch{return false;}};
// Bounded English observation itinerary. Host targets and neural responses are distinct.
export function browserRoam({page,onState,now=Date.now}){
 let x=640,y=360,step=0,taskIndex=0,entered=0,lastMove=0,prepared=false;
 const report=(phase,target='')=>onState({status:phase,mode:'field-study',asOf:new Date(now()).toISOString(),url:page.url(),task:{...FIELD_TASKS[taskIndex],phase,target,elapsedMs:entered?now()-entered:0},cursor:{x,y,step,action:phase,clickPermitted:false,assistance:'Host-selected observation field; measured neural responses are recorded separately.'}});
 return async function tick(){
  if(entered&&now()-entered>45000){taskIndex=(taskIndex+1)%FIELD_TASKS.length;entered=0;prepared=false;}
  const task=FIELD_TASKS[taskIndex];
  if(page.url()!==task.url){report('opening');await page.goto(task.url,{waitUntil:'domcontentloaded',timeout:20000});prepared=false;}
  if(!prepared){
   const english=await page.evaluate(()=>!/[\u3400-\u9fff]/u.test(document.body.innerText)&&(location.hostname!=='shakespeare.mit.edu'||document.body.innerText.includes('Shall I compare thee')));
   if(!english){taskIndex=0;entered=0;await page.goto(EXPLORE_URL,{waitUntil:'domcontentloaded'});return;}
   await page.evaluate(()=>{
    document.documentElement.lang='en';
    if(location.hostname==='shakespeare.mit.edu'){
     const box=document.querySelector('blockquote'),text=box?.innerText||'';
     if(text){box.textContent='';text.split(/\n/).map(s=>s.trim()).filter(Boolean).forEach((line,i)=>{const p=document.createElement('p');p.textContent=line;p.dataset.gaze=`Sonnet XVIII / line ${i+1}`;p.style.cssText='margin:0 0 8px';box.append(p);});}
     const style=document.createElement('style');style.textContent='body{background:#0a1010;color:#e7eadc;font:27px/1.5 Georgia;margin:35px 90px 120px}h1{font:12px monospace;letter-spacing:3px;color:#b7ce9c}blockquote{margin:25px 0}a{color:#caddae}.observed{color:#dff1a4}';document.head.append(style);
    }
    for(const id of ['family-cursor','family-gaze','family-study-hud'])document.getElementById(id)?.remove();
    const cursor=document.createElement('div');cursor.id='family-cursor';cursor.textContent='🪰';cursor.style.cssText='position:fixed;left:640px;top:360px;font-size:25px;z-index:2147483646;pointer-events:none';document.body.append(cursor);
    const gaze=document.createElement('div');gaze.id='family-gaze';gaze.style.cssText='position:fixed;width:300px;height:210px;left:490px;top:255px;border:1px solid #dcec9c;box-shadow:0 0 0 1px #0008;border-radius:8px;z-index:2147483645;pointer-events:none';document.body.append(gaze);
    const hud=document.createElement('div');hud.id='family-study-hud';hud.style.cssText='position:fixed;left:20px;right:20px;bottom:12px;background:#09110ff2;border:1px solid #435542;padding:12px 18px;border-radius:8px;color:#dce6d4;font:11px/1.6 monospace;z-index:2147483647;pointer-events:none';hud.textContent='FIELD STUDY / Waiting for a completed sample';document.body.append(hud);
   });
   prepared=true;entered=now();lastMove=0;
  }
  if(now()-lastMove<6500)return;
  lastMove=now();
  const target=await page.evaluate(n=>{
   const nodes=[...document.querySelectorAll('[data-gaze]')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
   const el=nodes[n%Math.max(1,nodes.length)];
   document.querySelectorAll('.observed').forEach(e=>e.classList.remove('observed'));
   if(el){el.classList.add('observed');el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:Math.max(160,Math.min(innerWidth-160,r.x+r.width/2)),y:Math.max(115,Math.min(innerHeight-145,r.y+r.height/2)),label:el.dataset.gaze};}
   return {x:640,y:360,label:'Page center'};
  },step);
  report('moving',target.label);
  await moveDecodedCursor(page,{x,y},target,1000);
  x=target.x;y=target.y;step++;
  await page.evaluate(({x,y})=>{const g=document.getElementById('family-gaze');if(g){g.style.left=`${x-150}px`;g.style.top=`${y-105}px`;}},{x,y});
  report('observing',target.label);
 };
}
