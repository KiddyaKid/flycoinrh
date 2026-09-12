import test from 'node:test';
import assert from 'node:assert/strict';
import {runLane} from './lib/live-loop.mjs';
test('slow model lane cannot block camera and transaction scans',async()=>{
 let active=true,camera=0,chain=0,models=0;
 const lane=(interval,task)=>runLane({interval,active:()=>active,task});
 const lanes=[lane(25,async()=>camera++),lane(30,async()=>chain++),lane(20,async()=>{models++;await new Promise(r=>setTimeout(r,180));})];
 await new Promise(r=>setTimeout(r,150));active=false;await Promise.all(lanes);
 assert.ok(camera>=4);assert.ok(chain>=3);assert.equal(models,1);
});
test('a failing lane recovers without overlapping work',async()=>{
 let active=true,count=0,errors=0,inflight=0,peak=0;
 await runLane({interval:25,active:()=>active,task:async()=>{peak=Math.max(peak,++inflight);count++;inflight--;if(count===1)throw Error('RPC_TIMEOUT');active=false;},onError:()=>errors++});
 assert.equal(count,2);assert.equal(errors,1);assert.equal(peak,1);
});
