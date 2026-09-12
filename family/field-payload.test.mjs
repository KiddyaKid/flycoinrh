import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {boundFieldSnapshot} from './lib/field-payload.mjs';
import {dossierStore} from './lib/tx-dossiers.mjs';
test('visual evidence is referenced without multiplying image payloads in TX rows',()=>{
 const db=new DatabaseSync(':memory:'),d=dossierStore(db),trade={id:'one',kind:'buy',hash:'0x1',timestamp:Date.now()};
 d.enqueue(trade);d.complete(trade,{parents:[],vision:{imageSha256:'abc',target:'reading',crop:'large image',on:[[0,0,180]],scene:'another image'}});
 assert.equal(d.get('one').vision.imageSha256,'abc');assert.equal(d.get('one').vision.crop,undefined);assert.equal(d.recent()[0].vision.on,undefined);db.close();
});
test('snapshot pressure evicts oldest thumbnails, never the latest neural response or swaps',()=>{
 const s={neural:{id:'latest'},records:[{hash:'keep',dossier:{vision:{imageSha256:'abc',crop:'x'.repeat(10000)}}}],observations:Array.from({length:12},(_,id)=>({id,vision:{crop:'x'.repeat(2000)}}))};
 const result=boundFieldSnapshot(s,6000);
 assert(Buffer.byteLength(JSON.stringify(result))<6000);assert.equal(result.neural.id,'latest');assert.equal(result.records[0].hash,'keep');assert.equal(result.observations[0].id,0);assert(result.observations.length<12);
});
