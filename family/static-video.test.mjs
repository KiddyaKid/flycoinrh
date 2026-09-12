import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {videoServer} from './lib/live-camera.mjs';
test('a static frame continues feeding the encoder without repeated direct-viewer packets',async()=>{
 const frame=Buffer.from('static-jpeg'),server=videoServer(()=>frame,0);
 const read=agent=>new Promise((resolve,reject)=>{let packets=0;const req=http.get({hostname:'127.0.0.1',port:server.address().port,path:'/video.mjpeg',headers:{'User-Agent':agent}},res=>{res.on('data',chunk=>{packets+=(chunk.toString().match(/--familyframe/g)||[]).length;});setTimeout(()=>{req.destroy();resolve(packets)},240);});req.on('error',reject);});
 try{await new Promise(r=>setTimeout(r,5));const [encoder,viewer]=await Promise.all([read('Lavf/61.0'),read('Browser test')]);assert(encoder>=4,encoder);assert.equal(viewer,1);}finally{server.close();}
});
