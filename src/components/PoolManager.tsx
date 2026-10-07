"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { poolSummary, preparePoolAction, PoolAction, PoolPosition } from "@/lib/pools";
import toast from "react-hot-toast";
import { submitTransaction } from "@/lib/transaction";

export default function PoolManager({ item, meteora, onComplete }: { item: PoolPosition; meteora: boolean; onComplete: () => void }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [summary,setSummary] = useState<{tokenA:string;tokenB:string} | null>(null);
  const [action,setAction] = useState<PoolAction>("add");
  const [input,setInput] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [prepared,setPrepared] = useState<Awaited<ReturnType<typeof preparePoolAction>> | null>(null);
  useEffect(() => {
    let active = true;
    if (publicKey) void poolSummary(connection,publicKey,item,meteora).then(v => { if(active) setSummary(v); }).catch(() => { if(active) setError("Pool information is not available yet. Refresh shortly."); });
    return () => { active = false; };
  }, [connection,publicKey,item,meteora]);
  const run = async () => {
    if (!publicKey || !signTransaction) return;
    setBusy(true);setError("");
    try {
      if (!prepared) setPrepared(await preparePoolAction(connection,publicKey,item,meteora,action,input));
      else { await submitTransaction(connection,publicKey,prepared.tx,signTransaction,`${action === "add" ? "Add" : action === "remove" ? "Remove" : "Claim"} liquidity`,prepared.signers,{pool:item.pool}); setPrepared(null);toast.success("Liquidity transaction confirmed.");onComplete(); }
    } catch(e) { setPrepared(null);setError(e instanceof Error ? e.message : "Liquidity transaction failed."); }
    finally {setBusy(false);}
  };
  return <div className="pool-details">
    {summary && <p className="status-note break-all">Token A: {summary.tokenA}<br/>Token B: {summary.tokenB}</p>}
    <label>Action<select aria-label="Liquidity action" value={action} disabled={busy} onChange={e => { setAction(e.target.value as PoolAction);setPrepared(null);setInput(""); }}><option value="add">Add liquidity</option><option value="remove">{meteora ? "Remove unlocked liquidity" : "Remove liquidity"}</option>{meteora && <option value="claim">Claim trading fees</option>}</select></label>
    {(action === "add" || (action === "remove" && !meteora)) && <label>{action === "add" ? "Token A amount" : "LP token amount"}<input className="field" aria-label="Liquidity amount" inputMode="decimal" value={input} disabled={busy} onChange={e => { setInput(e.target.value);setPrepared(null); }}/></label>}
    {prepared && <p className="status-note" role="status">{prepared.summary}</p>}
    <button className="primary-action" onClick={run} disabled={busy || !summary || !signTransaction || ((action === "add" || (action === "remove" && !meteora)) && !input)}>{busy ? "Preparing / awaiting wallet…" : prepared ? "Approve in wallet" : "Review transaction"}</button>
    {error && <p className="pools-error" role="alert">{error}</p>}
  </div>;
}
