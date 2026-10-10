import { list, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
export class StorageError extends Error {}
function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
}
export async function storageReady() {
  try {
    if (blobConfigured()) {
      await list({ limit: 1, abortSignal: AbortSignal.timeout(8000) });
      return true;
    }
    if (!process.env.PINATA_JWT) return false;
    return (await fetch("https://api.pinata.cloud/data/testAuthentication", {
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
      signal: AbortSignal.timeout(8000), cache: "no-store",
    })).ok;
  } catch { return false; }
}
export function gatewayUrl(cid: string) {
  if (!/^[a-zA-Z0-9]{32,100}$/.test(cid)) throw new StorageError("Storage returned an invalid content identifier.");
  const configured = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
  const url = new URL(configured.startsWith("https://") ? configured : `https://${configured}`);
  if (url.protocol !== "https:" || url.username || url.password) throw new StorageError("Storage gateway configuration is invalid.");
  return `${url.origin}/ipfs/${cid}`;
}
export async function pin(path: "pinFileToIPFS" | "pinJSONToIPFS", body: FormData | string) {
  if (blobConfigured()) {
    try {
      const file = body instanceof FormData ? body.get("file") : null;
      const isImage = path === "pinFileToIPFS";
      if (isImage && !(file instanceof File)) throw new StorageError("Choose a valid image.");
      const blob = await put(`tokens/${isImage ? "images" : "metadata"}/${randomUUID()}.${isImage ? (file as File).type === "image/png" ? "png" : "jpg" : "json"}`,
        isImage ? file as File : JSON.stringify(JSON.parse(body as string).pinataContent),
        { access: "public", allowOverwrite: false, contentType: isImage ? (file as File).type : "application/json", abortSignal: AbortSignal.timeout(20000) });
      if (!validHttpUrl(blob.url) || !blob.url.startsWith("https://")) throw new StorageError("Storage returned an invalid URL.");
      return blob.url;
    } catch {
      throw new StorageError("Token storage could not save this upload. No transaction was sent.");
    }
  }
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new StorageError("Token storage is unavailable. Please contact the site administrator.");
  const response = await fetch(`https://api.pinata.cloud/pinning/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${jwt}`, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new StorageError("Token storage could not save this upload. No transaction was sent.");
  return gatewayUrl((await response.json()).IpfsHash);
}
export function validHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
