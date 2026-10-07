"use client";
import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Search, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

type Coin = {
  mint: string;
  name: string;
  symbol: string;
  image: string;
  description: string;
  marketCap: number;
  buys: number;
  url: string;
};

export default function Tracker() {
  const [tokens,setTokens]=useState<Coin[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const router=useRouter();

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const res=await fetch("/api/trending?tab=trending&platform=all",{cache:"no-store"});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Tracker unavailable");
      setTokens(Array.isArray(data.tokens)?data.tokens.slice(0,12):[]);
    }catch(e){
      setError(e instanceof Error?e.message:"Tracker unavailable");
      setTokens([]);
    }finally{setLoading(false);}
  };

  useEffect(()=>{void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000); return () => window.clearInterval(timer);},[]);

  const copy=(coin:Coin)=>{
    sessionStorage.setItem("memers-copy-v1",JSON.stringify(coin));
    router.push("/");
  };

  const openX=(coin:Coin)=>{
    const q=encodeURIComponent('"' + coin.symbol + '" OR "' + coin.name + '" solana');
    window.open("https://x.com/search?q="+q+"&src=typed_query&f=live","_blank","noopener,noreferrer");
  };

  const filtered=tokens.filter(t=>{
    const q=query.trim().toLowerCase();
    return !q||t.name.toLowerCase().includes(q)||t.symbol.toLowerCase().includes(q)||t.mint.toLowerCase().includes(q);
  });

  return <section className="tracker-page">
    <div className="trending-hero">
      <h1><span className="x-icon">𝕏</span> Tracker - Real Time</h1>
      <p>Track active Solana coins, then jump straight to the live X conversation or copy public token details into the creator.</p>
    </div>

    <div className="trending-controls">
      <label className="tracker-search">
        <Search size={17}/>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, symbol or mint"/>
      </label>
      <button className="refresh-button" onClick={()=>void load()} disabled={loading} aria-label="Refresh tracker">
        <RefreshCw size={20} className={loading?"animate-spin":""}/>
      </button>
    </div>

    <p className="status-note">Live market activity is sourced from DEX Screener. X buttons open the live public X search for each token.</p>

    {error?<p className="pools-error" role="alert">{error}</p>:
      loading?<div className="pools-empty">Loading tracker...</div>:
      !filtered.length?<div className="pools-empty">No matching tokens found.</div>:
      <div className="trending-grid">
        {filtered.map(coin=><article className="coin-card" key={coin.mint}>
          <div className="coin-header">
            <div className="coin-identity">
              {coin.image?<img className="coin-logo" src={coin.image} alt={coin.name}/>:<div className="coin-logo">{coin.name.charAt(0)}</div>}
              <div><h3>{coin.name}</h3><p className="coin-symbol">{"$"+coin.symbol}</p></div>
            </div>
            <div className="coin-cap"><strong>{coin.buys.toLocaleString()}</strong><span> buys/1h</span></div>
          </div>
          <p className="coin-description">{coin.description?.slice(0,120)||"Public Solana token"}</p>
          <div className="coin-bottom">
            <div className="coin-links">
              <a href={coin.url} target="_blank" rel="noopener noreferrer" aria-label="Open market"><ExternalLink size={16}/></a>
              <a href={"https://solscan.io/token/"+coin.mint} target="_blank" rel="noopener noreferrer" aria-label="Open Solscan"><Search size={16}/></a>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="copy-button" onClick={()=>openX(coin)}>𝕏 Live</button>
              <button className="copy-button" onClick={()=>copy(coin)}><Zap size={15}/> Copy Coin</button>
            </div>
          </div>
        </article>)}
      </div>
    }
  </section>;
}
