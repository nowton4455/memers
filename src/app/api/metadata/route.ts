import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { pin, StorageError, validHttpUrl } from "@/lib/storage";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    if (text.length > 20000) return NextResponse.json({ error: "Metadata is too large." }, { status: 413 });
    let body;
    try { body = JSON.parse(text); new PublicKey(body.mint); } catch { return NextResponse.json({ error: "Provide valid metadata and a token mint." }, { status: 400 }); }
    const { metadata, mint } = body;
    if (!metadata || typeof metadata.name !== "string" || !metadata.name.trim() || Buffer.byteLength(metadata.name) > 32 || typeof metadata.symbol !== "string" || !metadata.symbol.trim() || Buffer.byteLength(metadata.symbol) > 10 || !validHttpUrl(metadata.image) || typeof metadata.description !== "string" || metadata.description.length > 5000)
      return NextResponse.json({ error: "Check the token name, symbol, image URL and description." }, { status: 400 });
    if (metadata.banner && !validHttpUrl(metadata.banner)) return NextResponse.json({ error: "Upload the banner before saving metadata." }, { status: 400 });
    return NextResponse.json({ uri: await pin("pinJSONToIPFS", JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `${mint}.json` } })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof StorageError ? error.message : "Metadata could not be saved. Please try again." }, { status: 503 });
  }
}
