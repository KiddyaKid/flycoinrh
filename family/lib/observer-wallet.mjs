// Real public account connection for the observation browser. No signer or key.
export async function installObserverWallet(page,rpc,owner){
 const reads=new Set(['eth_call','eth_getBalance','eth_getCode','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getTransactionCount','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory']);
 await page.exposeBinding('__observerRPC',async({frame},method,params=[])=>{
  if(new URL(frame.url()).origin!=='https://www.ponsfamily.com'||!reads.has(method))throw Error('OBSERVATION_WALLET_READ_ONLY');
  return rpc.send(method,params);
 });
 await page.addInitScript(({owner})=>{
  const events={};const p={isFlyfamily:true,chainId:'0x1237',selectedAddress:owner,
   async request({method,params=[]}){
    if(['eth_accounts','eth_requestAccounts'].includes(method)){for(const f of events.accountsChanged??[])f([owner]);return [owner];}
    if(method==='eth_chainId')return '0x1237';if(method==='net_version')return '4663';
    if(['wallet_getPermissions','wallet_requestPermissions'].includes(method))return [{parentCapability:'eth_accounts'}];
    if(method==='wallet_switchEthereumChain'&&params[0]?.chainId==='0x1237')return null;
    if(['eth_sendTransaction','personal_sign','eth_sign','eth_signTypedData_v4'].includes(method))throw Object.assign(Error('Observation wallet: signing is paused'),{code:4100});
    return window.__observerRPC(method,params);
   },on(k,f){(events[k]??=[]).push(f);return p;},removeListener(k,f){events[k]=(events[k]??[]).filter(v=>v!==f);return p;},isConnected:()=>true};
  Object.defineProperty(window,'ethereum',{value:p,configurable:true});
  const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'dc6b0638-6aa5-4f75-9d33-dca51be157b1',name:'FLYFAMILY Observer',rdns:'live.flyfamily.observer',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'},provider:p}}));
  window.addEventListener('eip6963:requestProvider',announce);announce();
 },{owner});
}
export async function connectObserverWallet(page){
 const account=page.locator('button').filter({hasText:/0x9ca6.*322c/i}).first();
 if(await account.isVisible())return true;
 const connect=page.getByRole('button',{name:/^Connect( wallet)?$/i}).first();
 if(!await connect.isVisible())return false;
 await connect.click();const choice=page.getByText('FLYFAMILY Observer',{exact:true});
 await choice.waitFor({timeout:10000});await choice.click();
 await account.waitFor({timeout:10000});return true;
}
