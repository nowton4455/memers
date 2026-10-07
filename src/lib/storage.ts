export class StorageError extends Error {}
export function gatewayUrl(cid: string) {
  if (!/^[a-zA-Z0-9]{32,100}$/.test(cid)) throw new StorageError("Storage returned an invalid content identifier.");
  const configured = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
  const url = new URL(configured.startsWith("https://") ? configured : `https://${configured}`);
  if (url.protocol !== "https:" || url.username || url.password) throw new StorageError("Storage gateway configuration is invalid.");
  return `${url.origin}/ipfs/${cid}`;
}
export async function pin(path: "pinFileToIPFS" | "pinJSONToIPFS", body: FormData | string) {
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
