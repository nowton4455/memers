"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import { RefreshCw, ExternalLink, Wallet } from "lucide-react";
import dynamic from "next/dynamic";
import { createLiquidityPool, poolConfigs, meteoraPositions, raydiumPositions, PoolConfig, PoolPosition, isDevnet } from "@/lib/pools";
import { formatAmount } from "@/lib/amount";
import PoolManager from "./PoolManager";
import { PendingTransaction } from "@/lib/transaction";
const WalletMultiButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then(m => m.WalletMultiButton), { ssr: false });
type Token = { mint: string; balance: string; standard: boolean };
export default function Liquidity({ meteora = false }: { meteora?: boolean }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [positionError, setPositionError] = useState("");
  const [configs, setConfigs] = useState<PoolConfig[]>([]);
  const [config, setConfig] = useState("");
  const [amount, setAmount] = useState("");
  const [sol, setSol] = useState("");
  const [positions, setPositions] = useState<PoolPosition[]>([]);
  const [receipt, setReceipt] = useState<{ pool: string; signature: string } | null>(null);
  const generation = useRef(0);
  const wallet = publicKey?.toBase58();
  const load = useCallback(async () => {
    const id = ++generation.current;
    setError(""); setPositionError(""); setTokens([]); setSelected(""); setConfigs([]); setConfig(""); setPositions([]); setReceipt(null);
    if (!publicKey) { setLoading(false); return; }
    setLoading(true);
    try {
      const responses = await Promise.all([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map(programId => connection.getParsedTokenAccountsByOwner(publicKey, { programId }, "confirmed")));
      if (id !== generation.current) return;
      const balances = new Map<string, { amount: bigint; decimals: number; standard: boolean }>();
      responses.forEach((r, i) => r.value.forEach(a => {
        const t = a.account.data.parsed.info;
        const old = balances.get(t.mint);
        balances.set(t.mint, { amount: (old?.amount || 0n) + BigInt(t.tokenAmount.amount), decimals: t.tokenAmount.decimals, standard: i === 0 });
      }));
      const next = [...balances].filter(([mint,t]) => t.amount > 0n && mint !== NATIVE_MINT.toBase58()).map(([mint,t]) => ({ mint, balance: formatAmount(t.amount,t.decimals), standard: t.standard }));
      setTokens(next);
      const preferred = new URLSearchParams(window.location.search).get("mint");
      if (next.some(t => t.mint === preferred)) setSelected(preferred!);
      const results = await Promise.allSettled([poolConfigs(connection, publicKey, meteora), meteora ? meteoraPositions(connection, publicKey) : raydiumPositions(connection, publicKey, [...balances.keys()])]);
      if (id !== generation.current) return;
      if (results[0].status === "fulfilled") { setConfigs(results[0].value); setConfig(results[0].value[0]?.id || ""); }
      else setError("Pool configurations could not be loaded. Refresh to try again.");
      if (results[1].status === "fulfilled") setPositions(results[1].value);
      else setPositionError("Positions could not be loaded. Refresh or open the DEX portfolio.");
    } catch { if (id === generation.current) setError("Could not load wallet tokens. Check your connection and refresh."); }
    finally { if (id === generation.current) setLoading(false); }
  }, [connection, publicKey, meteora]);
  useEffect(() => { void load(); return () => { ++generation.current; }; }, [load]);
  useEffect(() => {
    const confirmed = (event: Event) => {
      const p = (event as CustomEvent<PendingTransaction>).detail;
      if (p.wallet === wallet && p.endpoint === connection.rpcEndpoint && p.details?.pool) { setReceipt({ pool: p.details.pool, signature: p.signature }); setPositions(items => [{ pool: p.details!.pool }, ...items.filter(v => v.pool !== p.details!.pool)]); }
    };
    window.addEventListener("memers-confirmed", confirmed);
    return () => window.removeEventListener("memers-confirmed", confirmed);
  }, [wallet, connection, load]);
  const create = async () => {
    if (!publicKey || !signTransaction) return;
    setCreating(true); setError("");
    try {
      const result = await createLiquidityPool(connection, publicKey, selected, amount, sol, config, meteora, signTransaction);
      setReceipt(result); setPositions(p => [{ pool: result.pool }, ...p.filter(v => v.pool !== result.pool)]);
    } catch (e) { setError(e instanceof Error ? e.message : "Pool creation failed."); }
    finally { setCreating(false); }
  };
  const dexUrl = (pool?: string) => meteora ? (pool ? `https://www.meteora.ag/dammv2/${pool}` : "https://www.meteora.ag/portfolio") : (pool ? `https://raydium.io/liquidity/increase/?mode=add&pool_id=${pool}` : "https://raydium.io/portfolio/");
  return <section className="liquidity-page">
    <h1>Create {meteora ? "Meteora" : "Raydium"} Liquidity Pool</h1>
    <div className="dex-tabs" role="tablist" aria-label="Select DEX"><div><Link role="tab" aria-selected={!meteora} className={!meteora ? "active" : ""} href="/liquidity">Raydium</Link><Link role="tab" aria-selected={meteora} className={"meteora " + (meteora ? "active" : "")} href="/liquidity-meteora">Meteora</Link></div></div>
    <div className="pool-card">
      <label htmlFor="token-select-pool">For which token would you like to create a pool?</label>
      {!publicKey && <div className="wallet-gate compact"><div className="gate-icon"><Wallet size={24}/></div><h2>Connect your wallet</h2><p>Connect to load tokens held by this wallet.</p><WalletMultiButton /></div>}
      <select id="token-select-pool" value={selected} onChange={e => { setSelected(e.target.value); setReceipt(null); }} disabled={loading || creating || !publicKey}><option value="">{loading ? "Loading tokens…" : "Choose your token"}</option>{tokens.map(t => <option key={t.mint} value={t.mint} disabled={!t.standard}>{t.mint.slice(0,8)}…{t.mint.slice(-6)} ({t.balance}){!t.standard ? " · Token-2022: use DEX" : ""}</option>)}</select>
      {publicKey && !loading && !tokens.length && !error && <p className="status-note">This wallet has no token balances on {isDevnet ? "devnet" : "mainnet"}. Create or receive a token, then refresh.</p>}
      {selected && !receipt && <div className="pool-details">
        <p className="status-note">{meteora ? "Meteora DAMM V2" : "Raydium CPMM"} · {isDevnet ? "Devnet" : "Mainnet"} · Token / SOL</p>
        <label htmlFor="pool-token-amount">Token deposit</label><input id="pool-token-amount" className="field" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} disabled={creating} placeholder="Token amount"/>
        <label htmlFor="pool-sol-amount">SOL deposit</label><input id="pool-sol-amount" className="field" inputMode="decimal" value={sol} onChange={e => setSol(e.target.value)} disabled={creating} placeholder="SOL amount"/>
        <label htmlFor="pool-config">Pool configuration</label><select id="pool-config" value={config} onChange={e => setConfig(e.target.value)} disabled={creating}>{configs.map(c => <option key={c.id} value={c.id}>{c.label}{c.creationFee ? ` · creation ${c.creationFee}` : ""}</option>)}</select>
        <p className="status-note">Both deposits determine the initial price. DEX creation fees and Solana rent apply. Review the complete transaction in your wallet before approving.</p>
        <button className="primary-action" onClick={create} disabled={creating || !config || !amount || !sol || !signTransaction}>{creating ? "Preparing / awaiting wallet…" : "Create liquidity pool"}</button>
      </div>}
      {error && <p className="pools-error" role="alert">{error}</p>}
      {publicKey && <p className="status-note"><Link href={"/dashboard" + (selected ? "?mint=" + selected : "")}>Open Token Management</Link> to manage token authorities.</p>}
      {receipt && <div className="pool-details" role="status"><h2>Pool created and confirmed</h2><code className="break-all">{receipt.pool}</code><p><a className="primary-action" href={`https://solscan.io/tx/${receipt.signature}${isDevnet ? "?cluster=devnet" : ""}`} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={16}/></a></p></div>}
    </div>
    <div className="pools-section"><div className="pools-heading"><h2>Your {meteora ? "Meteora DAMM V2" : "Raydium"} Pools</h2><button className="refresh-button" onClick={() => void load()} disabled={loading || creating} aria-label="Refresh Pools"><RefreshCw size={20} className={loading ? "animate-spin" : ""}/></button></div>
      {positionError && <p className="pools-error" role="alert">{positionError}</p>}
      {loading ? <div className="pools-empty">Loading wallet positions…</div> : positions.length ? positions.map((p,i) => <div className="pool-card" key={p.position || p.pool + i}><code className="break-all">{p.pool}</code>{p.balance && <p>LP balance: {p.balance}</p>}{p.manageable && <PoolManager item={p} meteora={meteora} onComplete={() => void load()}/>}<p><a className="primary-action" href={dexUrl(p.pool)} target="_blank" rel="noopener noreferrer">Manage liquidity <ExternalLink size={16}/></a></p></div>) : <div className="pools-empty">{publicKey ? "No wallet-owned positions found." : "Connect your wallet to load your positions."}</div>}
      {publicKey && <p><a className="primary-action" href={dexUrl()} target="_blank" rel="noopener noreferrer">Open DEX portfolio <ExternalLink size={16}/></a></p>}
    </div>
  </section>;
}
