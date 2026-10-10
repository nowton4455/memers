import { NextRequest, NextResponse } from "next/server";
import { pin, StorageError } from "@/lib/storage";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 4.5 * 1024 * 1024)
    return NextResponse.json({ error: "Choose a PNG or JPG under 4MB." }, { status: 413 });
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type))
      return NextResponse.json({ error: "Choose a PNG or JPG under 4MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!(file.type === "image/png" ? png : jpg)) return NextResponse.json({ error: "The file contents do not match a PNG or JPG image." }, { status: 400 });
    const form = new FormData(); form.append("file", file);
    return NextResponse.json({ url: await pin("pinFileToIPFS", form) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof StorageError ? error.message : "Upload failed. Please try again." }, { status: 503 });
  }
}
