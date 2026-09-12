import test from 'node:test';import assert from 'node:assert/strict';import {videoServer} from './lib/live-camera.mjs';
test('video fanout reads once per tick and refuses excess streams',async()=>{
 let reads=0;const service=videoServer(()=>{reads++;return Buffer.from([255,216,reads%255,255,217]);},5194),streams=[];
 try{for(let n=0;n<8;n++){const res=await fetch('http://127.0.0.1:5194/video.mjpeg');assert.equal(res.status,200);streams.push(res);}
  const denied=await fetch('http://127.0.0.1:5194/video.mjpeg');assert.equal(denied.status,503);assert.equal(denied.headers.get('retry-after'),'30');
  const before=reads;await new Promise(r=>setTimeout(r,320));assert.ok(reads-before<=10,'Frame read count must not scale with eight viewers');assert.equal(service.metrics().clients,8);
 }finally{for(const stream of streams)await stream.body.cancel();service.close();}
});
