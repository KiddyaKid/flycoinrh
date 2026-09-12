// Independent, non-overlapping lanes. A slow brain/RPC must not stop the camera.
export async function runLane({interval,active,task,onError=()=>{}}){
 while(active()){
  const started=Date.now();
  try{await task();}catch(error){onError(error);}
  if(active())await new Promise(resolve=>setTimeout(resolve,Math.max(25,interval-(Date.now()-started))));
 }
}
