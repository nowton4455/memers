import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Connection, Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { parseAmount, formatAmount } from "../src/lib/amount";
import { submitTransaction, readPending, pendingStatus, PendingTransactionError } from "../src/lib/transaction";
const payer = Keypair.generate();
const blockhash = Keypair.generate().publicKey.toBase58();
let values: Map<string,string>;
beforeEach(() => {
  values = new Map();
  Object.assign(globalThis, { window: new EventTarget(), localStorage: { getItem: (k:string) => values.get(k) || null, setItem: (k:string,v:string) => values.set(k,v), removeItem: (k:string) => values.delete(k) } });
});
function mock(overrides: Record<string,unknown> = {}) {
  return { rpcEndpoint: "https://test.invalid", getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 100 }), simulateTransaction: async () => ({ value: { err: null } }), sendRawTransaction: async () => "signature", confirmTransaction: async () => ({ value: { err: null } }), getSignatureStatuses: async () => ({ value: [{ err: null, confirmationStatus: "confirmed" }] }), getBlockHeight: async () => 50, ...overrides } as unknown as Connection;
}
function tx() { return new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 })); }
const sign = async (t:Transaction) => { t.partialSign(payer); return t; };
test("large and fractional amounts remain exact", () => {
  assert.equal(parseAmount("9007199254740993",0),9007199254740993n);
  assert.equal(parseAmount("0.000000001",9),1n);
  assert.equal(formatAmount(18446744073709551615n,9),"18446744073.709551615");
  for (const value of ["0","-1","1e9","NaN","1.0000000001","18446744073709551616"]) assert.throws(() => parseAmount(value,9));
});
test("simulation failure never asks wallet to sign or sends funds", async () => {
  let signed = false, sent = false;
  await assert.rejects(submitTransaction(mock({ simulateTransaction: async () => ({ value: { err: "InsufficientFunds" } }), sendRawTransaction: async () => { sent = true; } }), payer.publicKey, tx(), async t => { signed = true; return t; }), /simulation failed/);
  assert.equal(signed,false); assert.equal(sent,false); assert.equal(readPending(),null);
});
test("on-chain error never reports success", async () => {
  await assert.rejects(submitTransaction(mock({ getSignatureStatuses: async () => ({ value: [{ err: { InstructionError: [0,"Custom"] } }] }) }),payer.publicKey,tx(),sign),/failed on-chain/);
  assert.equal(readPending(),null);
});
test("confirmation timeout recovers a landed transaction", async () => {
  let checks = 0;
  const result = await submitTransaction(mock({ getSignatureStatuses: async () => { if (++checks === 1) throw new Error("timeout"); return { value: [{ err: null, confirmationStatus: "confirmed" }] }; } }),payer.publicKey,tx(),sign);
  assert.ok(result.length > 70); assert.equal(readPending(),null);
});
test("unknown confirmation persists receipt and blocks duplicate submissions", async () => {
  let checks = 0;
  const connection = mock({ getSignatureStatuses: async () => { if (++checks === 1) throw new Error("timeout"); return { value: [null] }; } });
  await assert.rejects(submitTransaction(connection,payer.publicKey,tx(),sign,"Create token",[],{mint:"publicMint"}),PendingTransactionError);
  assert.equal(readPending()?.details?.mint,"publicMint");
  await assert.rejects(submitTransaction(connection,payer.publicKey,tx(),sign),PendingTransactionError);
  assert.equal(await pendingStatus(mock({getSignatureStatuses: async()=>({value:[null]}),getBlockHeight: async()=>101}),readPending()!),"expired");
});
test("wallet rejection sends nothing", async () => {
  let sent = false;
  await assert.rejects(submitTransaction(mock({sendRawTransaction:async()=>{sent=true;}}),payer.publicKey,tx(),async()=>{throw new Error("User rejected");}),/User rejected/);
  assert.equal(sent,false); assert.equal(readPending(),null);
});
test("token launch builds exact mint supply, signs both keys, and only succeeds after confirmation", async () => {
  const { createToken } = await import("../src/lib/token");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ uri: "https://gateway.pinata.cloud/ipfs/Qm11111111111111111111111111111111111111111111" }), { status: 200 });
  try {
    let checked = false;
    const result = await createToken(mock({getMinimumBalanceForRentExemption: async()=>1000000}),payer.publicKey,{
      name:"Acceptance Test",symbol:"TEST",decimals:9,supply:1000000000,description:"",image:"https://example.org/logo.png",enableTax:false,taxBasisPoints:0,maxTaxAmount:0,revokeMintAuthority:true,revokeFreezeAuthority:true,revokeUpdateAuthority:true,
    },async transaction=>{
      const mintTo = transaction.instructions.find(i=>i.data[0]===7 && i.data.length===9);
      assert.equal(mintTo?.data.readBigUInt64LE(1),1000000000000000000n);
      assert.ok(transaction.instructions.some(i=>i.data[0]===6));
      transaction.partialSign(payer); assert.equal(transaction.verifySignatures(),true);
      checked = true; return transaction;
    },"https://test.invalid");
    assert.equal(checked,true); assert.ok(result.mint); assert.ok(result.signature); assert.equal(readPending(),null);
  } finally { globalThis.fetch = originalFetch; }
});
