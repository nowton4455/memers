import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

// Public payment destination and prices approved by the site owner.
export const PLATFORM_RECEIVING_WALLET = "2Cj3RtZaWHwNGD6szajeppc1vMJKrHqdvs2iEBVZVWK4";
export const BASE_FEE_LAMPORTS = 200_000_000;
export const AUTHORITY_FEE_LAMPORTS = 100_000_000;
export type PaidAuthorities = {
  revokeMintAuthority: boolean;
  revokeFreezeAuthority: boolean;
  revokeUpdateAuthority?: boolean;
};
export function platformFeeLamports(config: PaidAuthorities): number {
  return BASE_FEE_LAMPORTS + AUTHORITY_FEE_LAMPORTS *
    [config.revokeMintAuthority, config.revokeFreezeAuthority, config.revokeUpdateAuthority].filter(Boolean).length;
}
export function platformFeeSol(config: PaidAuthorities): string {
  return (platformFeeLamports(config) / 1_000_000_000).toFixed(1);
}
export function platformFeeInstruction(payer: PublicKey, config: PaidAuthorities): TransactionInstruction {
  return SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PublicKey(PLATFORM_RECEIVING_WALLET), lamports: platformFeeLamports(config) });
}
