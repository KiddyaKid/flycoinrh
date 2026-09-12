import test from 'node:test';import assert from 'node:assert/strict';
import {checkScope} from './lib/local-key.mjs';
const owner='0x123',birth={id:'one'},now=1000000;
const scope={owner,chainId:4663,birthId:'one',maxLaunches:1,budgetETH:'0.02',expiresAt:new Date(now+10000).toISOString()};
test('local credential permits only its approved child and budget',()=>{
 assert.doesNotThrow(()=>checkScope(scope,birth,owner,now));
 for(const patch of [{birthId:'two'},{maxLaunches:2},{chainId:1},{owner:'0x456'},{budgetETH:'0.03'},{expiresAt:'invalid'},{expiresAt:new Date(now-1).toISOString()}])assert.throws(()=>checkScope({...scope,...patch},birth,owner,now));
});
