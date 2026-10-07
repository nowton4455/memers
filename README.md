# Memers

Next.js Solana token launcher, connected to Vercel through GitHub.

## Run and verify

```sh
npm ci
npm test
npm run build
npm run dev
```

Copy `.env.example` values into the deployment environment using the provider dashboard. Keep `PINATA_JWT` and `SOLANA_RPC_URL` private. `NEXT_PUBLIC_SOLANA_NETWORK` chooses `mainnet-beta` or `devnet` and must match the RPC endpoint. `/api/health` tests Pinata authentication; launches stop before wallet signing when storage is unavailable. RPC requests use a restricted same-origin HTTP proxy.

## Implemented flows

- Standard SPL token creation with durable IPFS image/metadata storage, exact supply calculation and configurable mint/freeze/metadata authorities.
- Token management: mint, burn, revoke authorities, update uploaded metadata and handle Token-2022 withheld fees.
- Raydium CPMM and Meteora DAMM V2 token/SOL pool creation; owned positions; review, add/remove liquidity; Meteora trading-fee claims. In-app pool management currently supports standard SPL tokens. Other pool types and Token-2022 positions open the DEX portfolio.
- Confirmed success only, unsigned simulation before wallet prompts, persisted public receipts for unknown confirmations, and recovery without duplicate submission.
- Live DEX Screener recent-profile market lists, token detail copying, and a market tracker that refreshes every minute and links to live X searches.

X searches are external links, not a native tweet API. The interface currently supports English.

## Acceptance testing

The automated tests cover exact amounts, invalid uploads, missing storage, RPC request restrictions, wallet rejection, failed simulation, failed on-chain status and unknown/confirmed recovery. They do not spend funds or prove funded mainnet execution.

Before declaring launch readiness: verify `/api/health`, use a reliable matching-network RPC, connect a funded devnet test wallet, create a token, inspect supply and authorities, create each supported pool, add/remove liquidity, claim fees, refresh positions, and exercise confirmation recovery. Production wallet approval always belongs to the user. Never commit keys or seed phrases.
