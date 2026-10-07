import { Connection, PublicKey, Transaction, Keypair, ComputeBudgetProgram } from "@solana/web3.js";
import { getMint, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { parseAmount } from "./amount";
import { formatAmount } from "./amount";
import { submitTransaction } from "./transaction";

export type PoolConfig = { id: string; label: string; creationFee?: string };
export type PoolPosition = { pool: string; position?: string; balance?: string; manageable?: boolean };
export const isDevnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet";

async function raydium(connection: Connection, owner: PublicKey) {
  const { Raydium } = await import("@raydium-io/raydium-sdk-v2");
  return Raydium.load({ connection, owner, cluster: isDevnet ? "devnet" : "mainnet", disableLoadToken: true, disableFeatureCheck: true });
}

export async function poolConfigs(connection: Connection, owner: PublicKey, meteora: boolean): Promise<PoolConfig[]> {
  if (meteora) {
    const { CpAmm } = await import("@meteora-ag/cp-amm-sdk");
    const configs = await new CpAmm(connection).getStaticConfigs();
    return configs.map(c => ({ id: c.publicKey.toBase58(), label: `DAMM V2 · ${c.publicKey.toBase58().slice(0, 8)}` }));
  }
  const sdk = await raydium(connection, owner);
  return (await sdk.api.getCpmmConfigs()).map(c => ({ id: String(c.index), label: `${c.tradeFeeRate / 10000}% trading fee`, creationFee: `${Number(c.createPoolFee) / 1e9} SOL` }));
}

export async function createLiquidityPool(connection: Connection, owner: PublicKey, mintAddress: string, tokenInput: string, solInput: string, configId: string, meteora: boolean, sign: (tx: Transaction) => Promise<Transaction>) {
  const mint = new PublicKey(mintAddress);
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info) throw new Error("Token mint was not found on this network.");
  const mintData = await getMint(connection, mint, "confirmed", info.owner);
  if (mintData.freezeAuthority) throw new Error("Revoke this token's freeze authority in Token Management before creating a liquidity pool.");
  const tokenAmount = new BN(parseAmount(tokenInput, mintData.decimals).toString());
  const solAmount = new BN(parseAmount(solInput, 9).toString());
  if (mint.equals(NATIVE_MINT)) throw new Error("Choose a token other than wrapped SOL.");
  // The UI currently supports standard SPL tokens; fail before signing extensions we cannot quote.
  if (!info.owner.equals(TOKEN_PROGRAM_ID)) throw new Error("Pool creation currently supports standard SPL tokens. Manage Token-2022 pools in the DEX.");
  if (meteora) {
    const { CpAmm, derivePoolAddress } = await import("@meteora-ag/cp-amm-sdk");
    const cp = new CpAmm(connection);
    const config = new PublicKey(configId);
    const state = await cp.fetchConfigState(config);
    const nft = Keypair.generate();
    const prepared = cp.preparePoolCreationParams({ tokenAAmount: tokenAmount, tokenBAmount: solAmount, minSqrtPrice: state.sqrtMinPrice, maxSqrtPrice: state.sqrtMaxPrice, collectFeeMode: state.collectFeeMode });
    const pool = derivePoolAddress(config, mint, NATIVE_MINT);
    if (await connection.getAccountInfo(pool)) throw new Error("This pool already exists for the selected configuration. Open it in the portfolio.");
    const tx = await cp.createPool({ creator: owner, payer: owner, config, positionNft: nft.publicKey, tokenAMint: mint, tokenBMint: NATIVE_MINT, tokenAAmount: tokenAmount, tokenBAmount: solAmount, activationPoint: null, tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, ...prepared });
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }));
    const signature = await submitTransaction(connection, owner, tx, sign, "Create Meteora pool", [nft], { pool: pool.toBase58() });
    return { pool: pool.toBase58(), signature };
  }
  const lib = await import("@raydium-io/raydium-sdk-v2");
  const sdk = await raydium(connection, owner);
  const configs = await sdk.api.getCpmmConfigs();
  const feeConfig = configs.find(c => String(c.index) === configId);
  if (!feeConfig) throw new Error("Select an available fee configuration.");
  if (isDevnet) feeConfig.id = lib.getCpmmPdaAmmConfigId(lib.DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, feeConfig.index).publicKey.toBase58();
  const built = await sdk.cpmm.createPool({ programId: isDevnet ? lib.DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM : lib.CREATE_CPMM_POOL_PROGRAM, poolFeeAccount: isDevnet ? lib.DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC : lib.CREATE_CPMM_POOL_FEE_ACC, mintA: { address: mintAddress, decimals: mintData.decimals, programId: info.owner.toBase58() }, mintB: { address: NATIVE_MINT.toBase58(), decimals: 9, programId: TOKEN_PROGRAM_ID.toBase58() }, mintAAmount: tokenAmount, mintBAmount: solAmount, startTime: new BN(0), feeConfig, associatedOnly: false, ownerInfo: { useSOLBalance: true }, txVersion: lib.TxVersion.LEGACY, computeBudgetConfig: { units: 600000 } });
  const pool = built.extInfo.address.poolId.toBase58();
  if (await connection.getAccountInfo(built.extInfo.address.poolId)) throw new Error("This pool already exists for the selected configuration. Open it in the portfolio.");
  const signature = await submitTransaction(connection, owner, built.transaction, sign, "Create Raydium pool", built.signers, { pool });
  return { pool, signature };
}

export async function meteoraPositions(connection: Connection, owner: PublicKey): Promise<PoolPosition[]> {
  const { CpAmm } = await import("@meteora-ag/cp-amm-sdk");
  return (await new CpAmm(connection).getPositionsByUser(owner)).map(p => ({ pool: p.positionState.pool.toBase58(), position: p.position.toBase58(), manageable: true }));
}

export async function raydiumPositions(connection: Connection, owner: PublicKey, mints: string[]): Promise<PoolPosition[]> {
  if (!mints.length) return [];
  if (isDevnet) throw new Error("Raydium's position index is available on mainnet. Use the devnet explorer for your new pool.");
  const sdk = await raydium(connection, owner);
  const result: PoolPosition[] = [];
  for (let offset = 0; offset < mints.length; offset += 30) {
    const pools = await sdk.api.fetchPoolByLpMints({ ids: mints.slice(offset, offset + 30).join(",") });
    for (const pool of pools) {
      if (pool.type !== "Standard") continue;
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(pool.lpMint.address) }, "confirmed");
      const balance = accounts.value.reduce((total, a) => total + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
      if (balance) result.push({ pool: pool.id, balance: formatAmount(balance, pool.lpMint.decimals), manageable: "config" in pool });
    }
  }
  return result;
}

export type PoolAction = "add" | "remove" | "claim";
export async function poolSummary(connection: Connection, owner: PublicKey, item: PoolPosition, meteora: boolean) {
  if (meteora) {
    const { CpAmm } = await import("@meteora-ag/cp-amm-sdk");
    const pool = await new CpAmm(connection).fetchPoolState(new PublicKey(item.pool));
    return { tokenA: pool.tokenAMint.toBase58(), tokenB: pool.tokenBMint.toBase58() };
  }
  const sdk = await raydium(connection, owner);
  const [pool] = await sdk.api.fetchPoolById({ ids: item.pool });
  if (!pool) throw new Error("Pool data is not indexed yet. Refresh shortly.");
  return { tokenA: `${pool.mintA.symbol} (${pool.mintA.address})`, tokenB: `${pool.mintB.symbol} (${pool.mintB.address})` };
}

/** Build and quote without signing. The caller presents the amounts before requesting approval. */
export async function preparePoolAction(connection: Connection, owner: PublicKey, item: PoolPosition, meteora: boolean, action: PoolAction, input: string) {
  if (!meteora) {
    const lib = await import("@raydium-io/raydium-sdk-v2");
    const sdk = await raydium(connection, owner);
    const [pool] = await sdk.api.fetchPoolById({ ids: item.pool });
    if (!pool || pool.type !== "Standard" || !("config" in pool)) throw new Error("Use the DEX portfolio to manage this pool type.");
    const slippage = new lib.Percent(1, 100);
    if (action === "claim") throw new Error("CPMM fees are reflected in your LP balance.");
    const built = action === "add"
      ? await sdk.cpmm.addLiquidity({ poolInfo: pool, inputAmount: new BN(parseAmount(input, pool.mintA.decimals).toString()), baseIn: true, slippage, txVersion: lib.TxVersion.LEGACY, computeBudgetConfig: { units: 600000 } })
      : await sdk.cpmm.withdrawLiquidity({ poolInfo: pool, lpAmount: new BN(parseAmount(input, pool.lpMint.decimals).toString()), slippage, txVersion: lib.TxVersion.LEGACY, computeBudgetConfig: { units: 600000 } });
    return { tx: built.transaction, signers: built.signers, summary: action === "add" ? `Deposit ${input} ${pool.mintA.symbol} plus the proportional ${pool.mintB.symbol} amount shown by your wallet. Slippage limit: 1%.` : `Withdraw ${input} LP tokens into ${pool.mintA.symbol} and ${pool.mintB.symbol}. Slippage limit: 1%.` };
  }
  const { CpAmm } = await import("@meteora-ag/cp-amm-sdk");
  const cp = new CpAmm(connection);
  const poolKey = new PublicKey(item.pool);
  const pool = await cp.fetchPoolState(poolKey);
  const positions = await cp.getUserPositionByPool(poolKey, owner);
  const position = positions.find(p => p.position.toBase58() === item.position);
  if (!position) throw new Error("This wallet no longer owns the position. Refresh your pools.");
  const [a,b] = await Promise.all([connection.getAccountInfo(pool.tokenAMint), connection.getAccountInfo(pool.tokenBMint)]);
  if (!a?.owner.equals(TOKEN_PROGRAM_ID) || !b?.owner.equals(TOKEN_PROGRAM_ID)) throw new Error("Use the Meteora portfolio to manage Token-2022 positions.");
  const [mintA, mintB] = await Promise.all([getMint(connection,pool.tokenAMint),getMint(connection,pool.tokenBMint)]);
  const common = { owner, position: position.position, pool: poolKey, positionNftAccount: position.positionNftAccount, tokenAMint: pool.tokenAMint, tokenBMint: pool.tokenBMint, tokenAVault: pool.tokenAVault, tokenBVault: pool.tokenBVault, tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID };
  let tx: Transaction;
  let summary: string;
  if (action === "claim") {
    tx = await cp.claimPositionFee(common); summary = "Claim available trading fees to your wallet.";
  } else if (action === "add") {
    const quote = cp.getDepositQuote({ inAmount: new BN(parseAmount(input,mintA.decimals).toString()), isTokenA: true, minSqrtPrice: pool.sqrtMinPrice, maxSqrtPrice: pool.sqrtMaxPrice, sqrtPrice: pool.sqrtPrice, collectFeeMode: pool.collectFeeMode, tokenAAmount: pool.tokenAAmount, tokenBAmount: pool.tokenBAmount, liquidity: pool.liquidity });
    const maxA = quote.actualInputAmount.muln(101).addn(99).divn(100);
    const maxB = quote.outputAmount.muln(101).addn(99).divn(100);
    tx = await cp.addLiquidity({ ...common, liquidityDelta: quote.liquidityDelta, maxAmountTokenA: maxA, maxAmountTokenB: maxB, tokenAAmountThreshold: maxA, tokenBAmountThreshold: maxB });
    summary = `Maximum deposits: ${formatAmount(BigInt(maxA.toString()),mintA.decimals)} token A and ${formatAmount(BigInt(maxB.toString()),mintB.decimals)} token B (1% slippage).`;
  } else {
    const liquidity = position.positionState.unlockedLiquidity;
    if (liquidity.isZero()) throw new Error("This position has no unlocked liquidity to withdraw.");
    const quote = cp.getWithdrawQuote({ liquidityDelta: liquidity, minSqrtPrice: pool.sqrtMinPrice, maxSqrtPrice: pool.sqrtMaxPrice, sqrtPrice: pool.sqrtPrice, collectFeeMode: pool.collectFeeMode, tokenAAmount: pool.tokenAAmount, tokenBAmount: pool.tokenBAmount, liquidity: pool.liquidity });
    const minA = quote.outAmountA.muln(99).divn(100), minB = quote.outAmountB.muln(99).divn(100);
    tx = await cp.removeLiquidity({ ...common, liquidityDelta: liquidity, tokenAAmountThreshold: minA, tokenBAmountThreshold: minB, vestings: [], currentPoint: new BN(pool.activationType === 0 ? await connection.getSlot("confirmed") : Math.floor(Date.now()/1000)) });
    summary = `Remove unlocked liquidity. Minimum returns: ${formatAmount(BigInt(minA.toString()),mintA.decimals)} token A and ${formatAmount(BigInt(minB.toString()),mintB.decimals)} token B (1% slippage). Locked liquidity remains locked.`;
  }
  tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }));
  return { tx, signers: [], summary };
}
