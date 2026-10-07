import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 30;
const METHODS = new Set(["getAccountInfo", "getBalance", "getBlockHeight", "getEpochInfo", "getFeeForMessage", "getGenesisHash", "getLatestBlockhash", "getMinimumBalanceForRentExemption", "getMultipleAccounts", "getProgramAccounts", "getSignatureStatuses", "getSlot", "getTokenAccountBalance", "getTokenAccountsByOwner", "getTokenSupply", "getTransaction", "getVersion", "isBlockhashValid", "sendTransaction", "simulateTransaction"]);
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    const text = await request.text();
    if (text.length > 50000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    let payload;
    try { payload = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    const items = Array.isArray(payload) ? payload : [payload];
    if (!items.length || items.length > 20 || items.some(item => !item || item.jsonrpc !== "2.0" || !METHODS.has(item.method)))
      return NextResponse.json({ error: "Unsupported RPC request." }, { status: 400 });
    const endpoint = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com");
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: text, signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "The Solana connection is unavailable. Please try again." }, { status: 503 });
    return new NextResponse(await response.text(), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "The Solana request timed out. Please try again." }, { status: 503 }); }
}
