import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as metadata } from "../src/app/api/metadata/route";
import { POST as upload } from "../src/app/api/upload/route";
import { POST as rpc } from "../src/app/api/rpc/route";
import { GET as health } from "../src/app/api/health/route";
const mint = "So11111111111111111111111111111111111111112";
test("invalid metadata is rejected before storage",async()=>{
 const response = await metadata(new NextRequest("https://test.invalid/api/metadata",{method:"POST",body:JSON.stringify({mint,metadata:{name:"A",symbol:"A",description:"",image:"blob:temporary"}})}));
 assert.equal(response.status,400);
});
test("image spoofing is rejected",async()=>{
 const data = new FormData(); data.append("file",new File(["not an image"],"test.png",{type:"image/png"}));
 assert.equal((await upload(new NextRequest("https://test.invalid/api/upload",{method:"POST",body:data}))).status,400);
});
test("missing storage disables readiness and never creates fake IPFS URLs",async()=>{
 const original = process.env.PINATA_JWT; delete process.env.PINATA_JWT;
 try {
  assert.equal((await health()).status,503);
  const response = await metadata(new NextRequest("https://test.invalid/api/metadata",{method:"POST",body:JSON.stringify({mint,metadata:{name:"A",symbol:"A",description:"",image:"https://example.org/a.png"}})}));
  assert.equal(response.status,503); assert.equal((await response.json()).uri,undefined);
 } finally { if(original) process.env.PINATA_JWT=original; }
});
test("RPC refuses foreign origins and arbitrary methods",async()=>{
 assert.equal((await rpc(new NextRequest("https://test.invalid/api/rpc",{method:"POST",headers:{origin:"https://attacker.invalid"},body:"{}"}))).status,403);
 assert.equal((await rpc(new NextRequest("https://test.invalid/api/rpc",{method:"POST",body:JSON.stringify({jsonrpc:"2.0",method:"requestAirdrop"})}))).status,400);
});
