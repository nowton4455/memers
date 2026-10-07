import { Connection, PublicKey, Transaction, VersionedTransaction, Signer } from "@solana/web3.js";
import bs58 from "bs58";

export type PendingTransaction = {
  signature: string; blockhash: string; lastValidBlockHeight: number;
  wallet: string; endpoint: string; label: string; details?: Record<string, string>;
};
const KEY = "memers-pending-transaction-v1";
export function readPending(): PendingTransaction | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function clearPending() {
  if (typeof window !== "undefined") { localStorage.removeItem(KEY); window.dispatchEvent(new Event("memers-transaction")); }
}
function savePending(pending: PendingTransaction) {
  if (typeof window !== "undefined") {
    // Persist before broadcasting. If storage is unavailable, stop before funds move.
    localStorage.setItem(KEY, JSON.stringify(pending));
    window.dispatchEvent(new Event("memers-transaction"));
  }
}
export class PendingTransactionError extends Error {
  constructor(public signature: string) {
    super("Confirmation is still pending. Check the transaction above before trying again.");
  }
}
export function assertNoPending(connection: Connection, wallet: PublicKey) {
  const pending = readPending();
  if (pending && pending.endpoint === connection.rpcEndpoint && pending.wallet === wallet.toBase58())
    throw new PendingTransactionError(pending.signature);
}
export async function pendingStatus(connection: Connection, pending: PendingTransaction): Promise<"confirmed" | "failed" | "expired" | "pending"> {
  const { value: [status] } = await connection.getSignatureStatuses([pending.signature], { searchTransactionHistory: true });
  if (status?.err) return "failed";
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return "confirmed";
  if (!status && await connection.getBlockHeight("finalized") > pending.lastValidBlockHeight) return "expired";
  return "pending";
}

export async function submitTransaction(
  connection: Connection, payer: PublicKey, tx: Transaction,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  label = "Transaction", signers: Signer[] = [], details?: Record<string, string>,
): Promise<string> {
  assertNoPending(connection, payer);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = payer; tx.recentBlockhash = blockhash;
  if (signers.length) tx.partialSign(...signers);
  // Simulate a copy so RPC blockhash replacement cannot invalidate mint signatures.
  const simulation = await connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()), {
    sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed",
  });
  if (simulation.value.err) throw new Error("Transaction simulation failed. Check your balance, token authorities and pool settings. No transaction was sent.");
  const signed = await signTransaction(tx);
  if (!signed.signature) throw new Error("The wallet did not sign the transaction.");
  const signature = bs58.encode(signed.signature);
  const pending: PendingTransaction = { signature, blockhash, lastValidBlockHeight, wallet: payer.toBase58(), endpoint: connection.rpcEndpoint, label, details };
  savePending(pending);
  try {
    await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 });
    const deadline = Date.now() + 45000;
    // HTTP polling works with private RPC proxies and does not depend on browser WebSocket access.
    while (true) {
      const status = await pendingStatus(connection, pending);
      if (status === "confirmed") break;
      if (status === "failed" || status === "expired") { clearPending(); throw new Error(`${label} ${status} on-chain.`); }
      if (Date.now() >= deadline) throw new PendingTransactionError(signature);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    clearPending();
    return signature;
  } catch (error) {
    if (!readPending() && typeof window !== "undefined") throw error;
    const status = await pendingStatus(connection, pending).catch(() => "pending");
    if (status === "confirmed") { clearPending(); return signature; }
    if (status === "failed" || status === "expired") { clearPending(); throw new Error(`${label} ${status}. No confirmed success was reported.`); }
    throw new PendingTransactionError(signature);
  }
}
