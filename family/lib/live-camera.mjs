import {createServer} from 'node:http';
// Only video is exposed on this port. No state, files, browser control or signing.
export function videoServer(getFrame,port=5191){
 const clients=new Set();let last=null,frames=0,bytes=0;
 // Read and encode once per frame, independent of viewer count. A slow viewer
 // drops frames instead of building an unbounded write queue.
 const timer=setInterval(()=>{const frame=getFrame();if(!frame||frame===last)return;last=frame;
  const packet=Buffer.concat([Buffer.from('--familyframe\r\nContent-Type: image/jpeg\r\nContent-Length: '+frame.length+'\r\n\r\n'),frame,Buffer.from('\r\n')]);frames++;
  for(const res of clients){if(res.writableLength>131072)continue;res.write(packet);bytes+=packet.length;}
 },40);
 const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store, no-transform');
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method!=='GET'||req.url!=='/video.mjpeg'){res.writeHead(404).end();return;}
  if(clients.size>=8){res.setHeader('Retry-After','30');res.writeHead(503).end();return;}
  res.writeHead(200,{'Content-Type':'multipart/x-mixed-replace; boundary=familyframe','X-Accel-Buffering':'no'});
  clients.add(res);
  res.on('close',()=>{clients.delete(res);});
 });
 server.listen(port,'127.0.0.1');
 return {metrics:()=>({clients:clients.size,limit:8,frames,bytes}),close(){clearInterval(timer);for(const client of clients)client.destroy();server.close();}};
}
export async function captureBrowser(page,onFrame){
 const session=await page.context().newCDPSession(page);
 session.on('Page.screencastFrame',event=>{
  onFrame(Buffer.from(event.data,'base64'));
  void session.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
 });
 await session.send('Page.startScreencast',{format:'jpeg',quality:45,maxWidth:1280,maxHeight:720,everyNthFrame:1});
 return async()=>{await session.send('Page.stopScreencast').catch(()=>{});await session.detach().catch(()=>{});};
}
