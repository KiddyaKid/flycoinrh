import {createHash} from 'node:crypto';
export function rawLogoCid(bytes){
 const digest=createHash('sha256').update(bytes).digest(),data=Buffer.concat([Buffer.from([1,0x55,0x12,0x20]),digest]);
 const alphabet='abcdefghijklmnopqrstuvwxyz234567';let value=0,bits=0,result='';
 for(const byte of data){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(value>>>bits)&31];}}
 if(bits)result+=alphabet[(value<<(5-bits))&31];
 return {url:'ipfs://b'+result,sourceSha256:digest.toString('hex'),method:'CIDv1 raw SHA-256 equals fixed local logo bytes'};
}
