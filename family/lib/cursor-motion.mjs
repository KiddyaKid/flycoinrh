// Move to a measured decoder endpoint before allowing the associated click.
// Intermediate positions are browser presentation, not extra neural samples.
export async function moveDecodedCursor(page,from,to,durationMs=160){
 const start=Date.now();
 for(;;){
  const t=Math.min(1,(Date.now()-start)/durationMs),x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t;
  await page.mouse.move(x,y);
  await page.locator('#family-cursor').evaluate((e,p)=>{e.style.left=p.x+'px';e.style.top=p.y+'px';},{x,y});
  if(t===1)return;
  await new Promise(resolve=>setTimeout(resolve,16));
 }
}
