"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { clearPending, pendingStatus, readPending, PendingTransaction } from "@/lib/transaction";
import toast from "react-hot-toast";

export default function PendingTransactions() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [pending, setPending] = useState<PendingTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setPending(readPending());
    update(); window.addEventListener("memers-transaction", update); window.addEventListener("storage", update);
    return () => { window.removeEventListener("memers-transaction", update); window.removeEventListener("storage", update); };
  }, []);
  if (!pending || pending.wallet !== publicKey?.toBase58() || pending.endpoint !== connection.rpcEndpoint) return null;
  const check = async () => {
    setBusy(true);
    try {
      const status = await pendingStatus(connection, pending);
      if (status === "pending") toast("Waiting for confirmation. Do not submit a duplicate.");
      else {
        if (status === "confirmed") {
          window.dispatchEvent(new CustomEvent("memers-confirmed", { detail: pending }));
          toast.success(`${pending.label} confirmed.`);
        } else toast.error(`Transaction ${status}. You can review and retry.`);
        clearPending();
      }
    } catch { toast.error("Could not check confirmation. Please try again."); }
    finally { setBusy(false); }
  };
  return <aside className="transaction-notice" role="status"><strong>{pending.label}: confirmation pending</strong><p>Keep this signature until the network confirms the result.</p><a href={`https://solscan.io/tx/${pending.signature}${process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`} target="_blank" rel="noopener noreferrer">View transaction</a><button onClick={check} disabled={busy}>{busy ? "Checking…" : "Check confirmation"}</button></aside>;
}
