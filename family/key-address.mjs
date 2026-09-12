// Receives a key only through a private pipe. Never print input or exceptions.
import {Wallet} from 'ethers';
let key='';
for await(const chunk of process.stdin){key+=chunk;if(key.length>100){process.exit(1);}}
try{process.stdout.write(new Wallet(key.trim()).address);}catch{process.exitCode=1;}finally{key='';}
