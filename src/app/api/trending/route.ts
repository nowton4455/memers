import { NextRequest, NextResponse } from "next/server";
type Profile = {
  chainId: string;
  tokenAddress: string;
  icon?: string;
  description?: string;
};
type Pair = {
  dexId: string;
  baseToken: { address: string; name: string; symbol: string };
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  txns?: { h1?: { buys?: number } };
  info?: { imageUrl?: string };
  url: string;
  pairCreatedAt?: number;
};
export async function GET(req: NextRequest) {
  try {
    const isNew = req.nextUrl.searchParams.get("tab") === "new";
    const platform = req.nextUrl.searchParams.get("platform");
    const options = { next: { revalidate: 60 }, signal: AbortSignal.timeout(10000) };
    const sources = await Promise.allSettled([
      fetch("https://api.dexscreener.com/token-profiles/latest/v1", options).then(async r => { if(!r.ok) throw new Error("Profiles unavailable"); return await r.json() as Profile[]; }),
      fetch("https://api-v3.raydium.io/pools/info/list?poolType=all&poolSortField=volume24h&sortType=desc&pageSize=20&page=1", options).then(async r => {
        if(!r.ok) throw new Error("Pool discovery unavailable");
        const data = await r.json() as { data?: { data?: { mintA: { address: string; logoURI?: string }; mintB: { address: string; logoURI?: string } }[] } };
        return (data.data?.data || []).flatMap(p => [p.mintA,p.mintB]).map(m => ({ chainId: "solana", tokenAddress: m.address, icon: m.logoURI }));
      }),
    ]);
    const profiles: Profile[] = sources.flatMap(r => r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []);
    if(sources.every(r => r.status === "rejected")) throw new Error("Token discovery unavailable");
    const excluded = new Set(["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);
    const unique = new Map<string,Profile>();
    for(const profile of profiles) if(profile.chainId === "solana" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(profile.tokenAddress) && !excluded.has(profile.tokenAddress) && !unique.has(profile.tokenAddress)) unique.set(profile.tokenAddress,profile);
    const solana = [...unique.values()].slice(0,60);
    if (!solana.length) return NextResponse.json({ tokens: [], source: "DEX Screener / Raydium" });
    const batches = [solana.slice(0,30),solana.slice(30)].filter(batch => batch.length);
    const pairResponses = await Promise.allSettled(batches.map(batch => fetch("https://api.dexscreener.com/tokens/v1/solana/" + batch.map(p => p.tokenAddress).join(","), { next: { revalidate: 60 }, signal: AbortSignal.timeout(10000) }).then(async r => { if(!r.ok) throw new Error("Market data unavailable"); return await r.json() as Pair[]; })));
    if(pairResponses.every(r => r.status === "rejected")) throw new Error("Market data unavailable");
    const pairs: Pair[] = pairResponses.flatMap(r => r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []);
    const best = new Map<string, Pair>();
    for (const p of pairs) {
      if (!p.baseToken || !unique.has(p.baseToken.address) || !/^https:\/\//.test(p.url)) continue;
      if (platform === "raydium" && p.dexId !== "raydium") continue;
      if (platform === "pumpfun" && !p.dexId.startsWith("pump")) continue;
      const old = best.get(p.baseToken.address);
      if (!old || (p.liquidity?.usd || 0) > (old.liquidity?.usd || 0))
        best.set(p.baseToken.address, p);
    }
    const tokens = Array.from(best.values())
      .sort((a, b) =>
        isNew
          ? (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0)
          : (b.txns?.h1?.buys || 0) - (a.txns?.h1?.buys || 0),
      )
      .map((p) => ({
        mint: p.baseToken.address,
        name: p.baseToken.name,
        symbol: p.baseToken.symbol,
        image:
          p.info?.imageUrl ||
          solana.find((t) => t.tokenAddress === p.baseToken.address)?.icon ||
          "",
        description:
          solana.find((t) => t.tokenAddress === p.baseToken.address)
            ?.description || p.baseToken.name,
        marketCap: p.marketCap || p.fdv || 0,
        buys: p.txns?.h1?.buys || 0,
        url: p.url,
        launchUrl: p.dexId === "pumpfun" ? `https://pump.fun/coin/${p.baseToken.address}` : "",
      }));
    return NextResponse.json({
      tokens,
      source: "DEX Screener / Raydium",
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Live token data is unavailable. Please refresh shortly." },
      { status: 502 },
    );
  }
}
