import { NextResponse } from "next/server";
import { storageReady } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET() {
  const storage = await storageReady();
  return NextResponse.json({ ready: storage, storage, message: storage ? "Token storage is ready." : "Token launches are temporarily unavailable because storage is not ready. Please contact the site administrator." }, { status: storage ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
