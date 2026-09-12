import {
  Contract,
  JsonRpcProvider,
  FetchRequest,
  Interface,
  ZeroAddress,
  getAddress,
  keccak256,
} from "ethers";
export const SOURCE_COMMIT = "debbc21fb27761245356fe9b61a9276437147a1c";
export const CHAIN_ID = 4663;
export const FACTORY_ABI = [
  "function launchEnabled() view returns (bool)",
  "function canLaunch(address) view returns (bool)",
  "function launchFee() view returns (uint256)",
  "function launchConfigCount() view returns (uint256)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function snipeTaxStartBps() view returns (uint256)",
  "function snipeTaxSeconds() view returns (uint256)",
  "function feeEscrow() view returns (address)",
  "function memeHook() view returns (address)",
  "function getLaunchConfig(uint256) view returns (tuple(uint256 supply,uint256 curveFeeBps,uint256 phantomQuote,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,bool enabled))",
  "function previewLaunchEconomics(uint256,address) view returns (bytes32)",
  "function launchToken(tuple(string name,string symbol,string logo,string description,tuple(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt) params,uint256 launchConfigId,address pairToken) payable returns (address token,address curve)",
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)",
];
export const CURVE_ABI = [
  "event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)",
  "event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)",
  "event FeesSwept(uint256 protocolAmount,uint256 buybackAmount,uint256 creatorAmount)",
  // PONS V2 stores the current fee recipient in the legacy-named deployer field.
  "function deployer() view returns (address)",
  "function sweepFees(uint256 minBuybackTokensOut)",
  "function creatorTaxBalance() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function token() view returns (address)",
  "function graduated() view returns (bool)",
];
export const ESCROW_ABI = [
  "function balanceOf(address recipient) view returns(uint256)",
  "function balanceOfToken(address recipient,address token) view returns(uint256)",
  "function claim() returns(uint256)",
  "function claimToken(address token) returns(uint256)",
];
export function provider(url) {
  const req = new FetchRequest(url);
  req.timeout = 12000;
  return new JsonRpcProvider(req, undefined, { batchMaxCount: 1 });
}
export const serial = (value) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
export async function preflight(rpc, factoryAddress, recipient) {
  const p = provider(rpc);
  try {
    const chain = Number((await p.getNetwork()).chainId);
    if (chain !== CHAIN_ID)
      throw Error(`Wrong chain: ${chain}. Expected ${CHAIN_ID}.`);
    const factory = getAddress(factoryAddress),
      block = await p.getBlockNumber(),
      code = await p.getCode(factory, block);
    if (code === "0x") throw Error("No factory bytecode at this address.");
    const c = new Contract(factory, FACTORY_ABI, p),
      opts = { blockTag: block };
    const [
      launchEnabled,
      launchFee,
      count,
      maxTax,
      snipeBps,
      snipeSeconds,
      escrow,
      hook,
    ] = await Promise.all([
      c.launchEnabled(opts),
      c.launchFee(opts),
      c.launchConfigCount(opts),
      c.maxCreatorTaxBps(opts),
      c.snipeTaxStartBps(opts),
      c.snipeTaxSeconds(opts),
      c.feeEscrow(opts),
      c.memeHook(opts),
    ]);
    if (count > 64n)
      throw Error("Unexpected number of configurations; inspect manually.");
    const configs = [];
    for (let i = 0; i < Number(count); i++) {
      const x = await c.getLaunchConfig(i, opts);
      configs.push({
        id: i,
        supply: x.supply,
        curveFeeBps: x.curveFeeBps,
        phantomQuote: x.phantomQuote,
        graduationThreshold: x.graduationThreshold,
        poolFee: x.poolFee,
        tickSpacing: x.tickSpacing,
        enabled: x.enabled,
        expectedEconomics: await c.previewLaunchEconomics(i, ZeroAddress, opts),
      });
    }
    const recipientState = recipient
      ? {
          address: getAddress(recipient),
          codePresent: (await p.getCode(recipient, block)) !== "0x",
          canLaunch: await c.canLaunch(recipient, opts),
          nativeBalance: await p.getBalance(recipient, block),
          claimable: await new Contract(escrow, ESCROW_ABI, p).balanceOf(
            recipient,
            opts,
          ),
        }
      : null;
    return {
      mode: "read-only-preflight",
      sourceCommit: SOURCE_COMMIT,
      chainId: chain,
      blockNumber: block,
      factory,
      bytecodeHash: keccak256(code),
      launchEnabled,
      launchFee,
      maxCreatorTaxBps: maxTax,
      snipeTaxStartBps: snipeBps,
      snipeTaxSeconds: snipeSeconds,
      feeEscrow: escrow,
      memeHook: hook,
      configs,
      recipient: recipientState,
      verification:
        "Code presence and ABI reads only; bytecode-to-source verification and treasury review remain required.",
    };
  } finally {
    p.destroy();
  }
}
export function decodeCurveLog(log) {
  const event = new Interface(CURVE_ABI).parseLog(log);
  if (!event) return null;
  return {
    eventId: `${CHAIN_ID}:${log.transactionHash}:${log.index}`,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    event: event.name,
    args: event.args.toObject(),
  };
}
