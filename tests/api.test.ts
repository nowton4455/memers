import test from "node:test";
import assert from "node:assert/strict";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
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
 const keys = ["PINATA_JWT", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN"];
 const original = keys.map(key => process.env[key]); keys.forEach(key => delete process.env[key]);
 try {
  assert.equal((await health()).status,503);
  const response = await metadata(new NextRequest("https://test.invalid/api/metadata",{method:"POST",body:JSON.stringify({mint,metadata:{name:"A",symbol:"A",description:"",image:"https://example.org/a.png"}})}));
  assert.equal(response.status,503); assert.equal((await response.json()).uri,undefined);
 } finally { keys.forEach((key,i) => {if(original[i] === undefined) delete process.env[key]; else process.env[key]=original[i];}); }
});
test("Blob readiness, image upload and metadata publish use real public URLs",async()=>{
 const originalDispatcher = getGlobalDispatcher(), originalToken = process.env.BLOB_READ_WRITE_TOKEN;
 const agent = new MockAgent(); agent.disableNetConnect(); setGlobalDispatcher(agent);
 const pool = agent.get("https://vercel.com");
 pool.intercept({path:/^\/api\/blob/,method:"GET"}).reply(200,{blobs:[],hasMore:false});
 process.env.BLOB_READ_WRITE_TOKEN="vercel_blob_rw_test_test";
 const saved: string[]=[];
 pool.intercept({path:/^\/api\/blob/,method:"PUT"}).reply(200, (options)=>{
  const pathname = new URL(options.path,"https://vercel.com").searchParams.get("pathname")!;
  saved.push(pathname);
  if(pathname.endsWith(".json")) {
   const payload=JSON.parse(String(options.body));
   assert.equal(payload.name,"Test"); assert.equal(payload.pinataContent,undefined);
  }
  return JSON.stringify({url:`https://test.public.blob.vercel-storage.com/${pathname}`,pathname,contentType:pathname.endsWith(".json")?"application/json":"image/png",contentDisposition:"inline",downloadUrl:"https://test.public.blob.vercel-storage.com/download"});
 }).persist();
 try {
  assert.equal((await health()).status,200);
  const form=new FormData();form.append("file",new File([new Uint8Array([137,80,78,71,13,10,26,10])],"test.png",{type:"image/png"}));
  const imageResponse=await upload(new NextRequest("https://test.invalid/api/upload",{method:"POST",body:form}));
  assert.equal(imageResponse.status,200);const {url}=await imageResponse.json();
  const response=await metadata(new NextRequest("https://test.invalid/api/metadata",{method:"POST",body:JSON.stringify({mint,metadata:{name:"Test",symbol:"TST",description:"Storage test",image:url}})}));
  assert.equal(response.status,200); assert.ok((await response.json()).uri.endsWith(".json"));
  assert.equal(saved.length,2);
 } finally {setGlobalDispatcher(originalDispatcher); await agent.close(); if(originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN=originalToken;}
});
test("RPC refuses foreign origins and arbitrary methods",async()=>{
 assert.equal((await rpc(new NextRequest("https://test.invalid/api/rpc",{method:"POST",headers:{origin:"https://attacker.invalid"},body:"{}"}))).status,403);
 assert.equal((await rpc(new NextRequest("https://test.invalid/api/rpc",{method:"POST",body:JSON.stringify({jsonrpc:"2.0",method:"requestAirdrop"})}))).status,400);
});
test("Raydium discovery keeps the default listing functional when recent profiles are empty",async()=>{
 const { GET } = await import("../src/app/api/trending/route");
 const original = globalThis.fetch;
 const token = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
 globalThis.fetch = async (input) => {
  const url=String(input);
  const data = url.includes("token-profiles") ? [] : url.includes("raydium.io") ? {data:{data:[{mintA:{address:mint},mintB:{address:token}}]}} : [{dexId:"raydium",baseToken:{address:token,name:"RAY",symbol:"RAY"},url:"https://dexscreener.com/solana/example",txns:{h1:{buys:12}}}];
  return new Response(JSON.stringify(data),{status:200});
 };
 try { const response = await GET(new NextRequest("https://test.invalid/api/trending?platform=raydium")); assert.equal(response.status,200);const data=await response.json();assert.equal(data.tokens.length,1);assert.equal(data.tokens[0].mint,token);assert.equal(data.tokens[0].buys,12);assert.equal(data.tokens[0].launchUrl, ""); }
 finally {globalThis.fetch=original;}
});
