import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  let storage = false;
  if (process.env.PINATA_JWT) {
    try {
      storage = (await fetch("https://api.pinata.cloud/data/testAuthentication", { headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` }, signal: AbortSignal.timeout(8000), cache: "no-store" })).ok;
    } catch {}
  }
  return NextResponse.json({ ready: storage, storage, message: storage ? "Token storage is ready." : "Token launches are temporarily unavailable because storage is not ready. Please contact the site administrator." }, { status: storage ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
