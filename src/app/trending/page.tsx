"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Zap, Activity, Search, ExternalLink } from "lucide-react";
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
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
export default function Trending() {
  const [tab, setTab] = useState("trending");
  const [platform, setPlatform] = useState("raydium");
  const [tokens, setTokens] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/trending?tab=${tab}&platform=${platform}`,
          { signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setTokens(data.tokens);
      } catch (e) {
        if (signal?.aborted) return;
        setTokens([]);
        setError(e instanceof Error ? e.message : "Unable to load coins");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [tab, platform],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const copy = (coin: Coin) => {
    sessionStorage.setItem("memers-copy-v1", JSON.stringify(coin));
    router.push("/");
  };
  return (
    <section className="trending-page">
      <div className="trending-hero">
        <h1>Copy Trending Coins in 1 Click ⚡</h1>
        <p>
          Use public token details as a starting point for your own coin on
          Solana.
        </p>
      </div>
      <div className="trending-controls">
        <div className="trending-tabs" role="tablist" aria-label="Coin list">
          <button
            role="tab"
            aria-selected={tab === "trending"}
            className={tab === "trending" ? "active" : ""}
            onClick={() => setTab("trending")}
          >
            Trending
          </button>
          <button
            role="tab"
            aria-selected={tab === "new"}
            className={tab === "new" ? "active" : ""}
            onClick={() => setTab("new")}
          >
            New
          </button>
        </div>
        <div className="trending-actions">
          <select
            className="platform-select"
            aria-label="Switch Platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="raydium">◉ Raydium</option>
            <option value="pumpfun">💊 Pump.fun</option>
            <option value="all">All platforms</option>
          </select>
          <button
            className="refresh-button"
            aria-label="Refresh coins"
            disabled={loading}
            onClick={() => load()}
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      <p className="status-note" style={{ marginBottom: 16, fontSize: 12 }}>
        Live DEX Screener data from recent profiles and active Raydium pools.
        Trending ranks by buys in the last hour; New ranks by pool creation time.
      </p>
      {error ? (
        <p role="alert" className="pools-error">
          {error}
        </p>
      ) : loading ? (
        <div className="pools-empty">Loading coins...</div>
      ) : !tokens.length ? (
        <div className="pools-empty">No coins found on this platform.</div>
      ) : (
        <div className="trending-grid">
          {tokens.map((coin) => (
            <article className="coin-card" key={coin.mint}>
              <div className="coin-header">
                <div className="coin-identity">
                  {coin.image ? (
                    <img
                      className="coin-logo"
                      src={coin.image}
                      alt={coin.name}
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : (
                    <div className="coin-logo">{coin.name.charAt(0)}</div>
                  )}
                  <div>
                    <h3>{coin.name}</h3>
                    <p className="coin-symbol">${coin.symbol}</p>
                  </div>
                </div>
                <div className="coin-cap">
                  Market Cap:
                  <strong>
                    {coin.marketCap ? money(coin.marketCap) : "—"}
                  </strong>
                </div>
              </div>
              <p className="coin-description">
                {coin.description.slice(0, 140)}
              </p>
              <p className="coin-buys">
                ◷ Activity: {coin.buys.toLocaleString()} buys/1h
              </p>
              <div className="coin-bottom">
                <div className="coin-links">
                  <a
                    href={`https://pump.fun/coin/${coin.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Pump.fun"
                  >
                    💊
                  </a>
                  <a
                    href={coin.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="DexScreener"
                  >
                    <Activity size={16} />
                  </a>
                  <a
                    href={`https://solscan.io/token/${coin.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Solscan"
                  >
                    <Search size={16} />
                  </a>
                </div>
                <button className="copy-button" onClick={() => copy(coin)}>
                  <Zap size={16} />
                  Copy Coin
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="custom-coin">
        <h3>Want to create your own custom coin instead?</h3>
        <p>Design your own token with custom name, symbol, and image.</p>
        <Link href="/" className="primary-action">
          Create Custom Coin <ExternalLink size={16} />
        </Link>
      </div>
    </section>
  );
}
