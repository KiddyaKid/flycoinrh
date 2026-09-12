import {createServer} from 'node:http';
// Only video is exposed on this port. No state, files, browser control or signing.
export function videoServer(getFrame,port=5191){
 const clients=new Set();
 const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store, no-transform');
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method!=='GET'||req.url!=='/video.mjpeg'){res.writeHead(404).end();return;}
  if(clients.size>=40){res.writeHead(503).end();return;}
  res.writeHead(200,{'Content-Type':'multipart/x-mixed-replace; boundary=familyframe','X-Accel-Buffering':'no'});
  clients.add(res);let last=null;
  const timer=setInterval(()=>{
   const frame=getFrame();if(!frame||frame===last||res.writableLength>262144)return;
   last=frame;
   res.write(Buffer.concat([Buffer.from('--familyframe\r\nContent-Type: image/jpeg\r\nContent-Length: '+frame.length+'\r\n\r\n'),frame,Buffer.from('\r\n')]));
  },66);
  res.on('close',()=>{clearInterval(timer);clients.delete(res);});
 });
 server.listen(port,'127.0.0.1');
 return {close(){for(const client of clients)client.destroy();server.close();}};
}
export async function captureBrowser(page,onFrame){
 const session=await page.context().newCDPSession(page);
 session.on('Page.screencastFrame',event=>{
  onFrame(Buffer.from(event.data,'base64'));
  void session.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
 });
 await session.send('Page.startScreencast',{format:'jpeg',quality:55,maxWidth:1280,maxHeight:720,everyNthFrame:2});
 return async()=>{await session.send('Page.stopScreencast').catch(()=>{});await session.detach().catch(()=>{});};
}
