import { Buffer } from "buffer";
import { submitTransaction, assertNoPending } from "./transaction";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  ExtensionType,
  getMintLen,
  createSetAuthorityInstruction,
  AuthorityType,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction as createInitializeMintInstructionLegacy,
  createInitializeMetadataPointerInstruction,
  createHarvestWithheldTokensToMintInstruction,
  createWithdrawWithheldTokensFromMintInstruction,
  createWithdrawWithheldTokensFromAccountsInstruction,
  getTransferFeeConfig,
  getMint,
  getTransferFeeAmount,
  getAccount,
  unpackAccount,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from "@solana/spl-token-metadata";

const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

export interface TokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  supply: number;
  description: string;
  image: string;
  banner?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  enableTax: boolean;
  taxBasisPoints: number;
  maxTaxAmount: number;
  taxWithdrawAuthority?: string;
  revokeMintAuthority: boolean;
  revokeFreezeAuthority: boolean;
  revokeUpdateAuthority?: boolean;
  creatorName?: string;
  creatorWebsite?: string;
}

export interface UpdateMetadataConfig {
  name: string;
  symbol: string;
  description: string;
  image: string;
  banner?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
}

export interface TokenResult {
  mint: string;
  signature: string;
  tokenAccount: string;
  metadataUri: string;
}

// Build CreateMetadataAccountV3 instruction manually (avoids Umi dependency issues)
function createMetadataInstruction(
  metadataPDA: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  isMutable: boolean,
): TransactionInstruction {
  const data = Buffer.alloc(1000);
  let offset = 0;

  // Instruction discriminator: CreateMetadataAccountV3 = 33
  data.writeUInt8(33, offset);
  offset += 1;

  // Data struct
  // name (string: 4-byte length + utf8)
  const nameBytes = Buffer.from(name);
  data.writeUInt32LE(nameBytes.length, offset);
  offset += 4;
  nameBytes.copy(data, offset);
  offset += nameBytes.length;

  // symbol
  const symbolBytes = Buffer.from(symbol);
  data.writeUInt32LE(symbolBytes.length, offset);
  offset += 4;
  symbolBytes.copy(data, offset);
  offset += symbolBytes.length;

  // uri
  const uriBytes = Buffer.from(uri);
  data.writeUInt32LE(uriBytes.length, offset);
  offset += 4;
  uriBytes.copy(data, offset);
  offset += uriBytes.length;

  // sellerFeeBasisPoints
  data.writeUInt16LE(0, offset);
  offset += 2;

  // creators: Option<Vec<Creator>> = None
  data.writeUInt8(0, offset);
  offset += 1;

  // collection: Option<Collection> = None
  data.writeUInt8(0, offset);
  offset += 1;

  // uses: Option<Uses> = None
  data.writeUInt8(0, offset);
  offset += 1;

  // isMutable: false when update authority is intentionally revoked
  data.writeUInt8(isMutable ? 1 : 0, offset);
  offset += 1;

  // collectionDetails: Option<CollectionDetails> = None
  data.writeUInt8(0, offset);
  offset += 1;

  const accounts = [
    { pubkey: metadataPDA, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: mintAuthority, isSigner: true, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: updateAuthority, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys: accounts,
    programId: METADATA_PROGRAM_ID,
    data: data.subarray(0, offset),
  });
}

function buildMetadataJson(config: TokenConfig, baseUrl: string, creatorWallet: string): object {
  const metadata: Record<string, unknown> = {
    name: config.name,
    symbol: config.symbol,
    description: config.description,
    image: config.image.startsWith("http")
      ? config.image
      : `${baseUrl}${config.image}`,
  };

  if (config.banner) {
    metadata.banner = config.banner.startsWith("http")
      ? config.banner
      : `${baseUrl}${config.banner}`;
  }

  const links: Record<string, string> = {};
  if (config.website) links.website = config.website;
  if (config.twitter) links.twitter = config.twitter;
  if (config.telegram) links.telegram = config.telegram;
  if (config.discord) links.discord = config.discord;

  if (Object.keys(links).length > 0) {
    metadata.external_url = config.website || "";
    metadata.extensions = links;
  }

  if (config.creatorName || config.creatorWebsite) {
    metadata.creator = {
      name: config.creatorName || "",
      website: config.creatorWebsite || "",
      wallet: creatorWallet,
    };
  }

  return metadata;
}

export async function createToken(
  connection: Connection,
  payer: PublicKey,
  config: TokenConfig,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  baseUrl: string,
): Promise<TokenResult> {
  if (!Number.isSafeInteger(config.supply) || config.supply <= 0)
    throw new Error("Supply must be a positive whole number.");
  if (
    !Number.isInteger(config.decimals) ||
    config.decimals < 0 ||
    config.decimals > 9
  )
    throw new Error("Decimals must be between 0 and 9.");
  if (
    BigInt(config.supply) * 10n ** BigInt(config.decimals) >
    18446744073709551615n
  )
    throw new Error(
      "Supply exceeds the token program limit for these decimals.",
    );
  if (
    Buffer.byteLength(config.name, "utf8") > 32 ||
    Buffer.byteLength(config.symbol, "utf8") > 10
  )
    throw new Error("Token name or symbol is too long.");
  if (!/^https?:\/\//.test(config.image))
    throw new Error("Upload a token image before creating the token.");
  assertNoPending(connection, payer);
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  const metadataJson = buildMetadataJson(config, baseUrl, payer.toBase58());
  const metadataRes = await fetch("/api/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata: metadataJson, mint: mint.toBase58() }),
  });
  const metadataData = await metadataRes.json();
  if (!metadataRes.ok || typeof metadataData.uri !== "string")
    throw new Error(
      metadataData.error ||
        "Metadata upload failed. No transaction was submitted.",
    );
  const metadataUri: string = metadataData.uri;

  if (config.enableTax) {
    return createTaxToken(
      connection,
      payer,
      config,
      signTransaction,
      mintKeypair,
      metadataUri,
    );
  } else {
    return createStandardToken(
      connection,
      payer,
      config,
      signTransaction,
      mintKeypair,
      metadataUri,
    );
  }
}

async function createStandardToken(
  connection: Connection,
  payer: PublicKey,
  config: TokenConfig,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  mintKeypair: Keypair,
  metadataUri: string,
): Promise<TokenResult> {
  const mint = mintKeypair.publicKey;
  const lamports = await connection.getMinimumBalanceForRentExemption(82);
  const ata = getAssociatedTokenAddressSync(
    mint,
    payer,
    false,
    TOKEN_PROGRAM_ID,
  );

  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  );

  const tx = new Transaction();

  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      space: 82,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  tx.add(
    createInitializeMintInstructionLegacy(
      mint,
      config.decimals,
      payer,
      config.revokeFreezeAuthority ? null : payer,
      TOKEN_PROGRAM_ID,
    ),
  );

  tx.add(
    createMetadataInstruction(
      metadataPDA,
      mint,
      payer,
      payer,
      payer,
      config.name,
      config.symbol,
      metadataUri,
      !config.revokeUpdateAuthority,
    ),
  );

  tx.add(
    createAssociatedTokenAccountInstruction(
      payer,
      ata,
      payer,
      mint,
      TOKEN_PROGRAM_ID,
    ),
  );

  const mintAmount = BigInt(config.supply) * 10n ** BigInt(config.decimals);
  tx.add(
    createMintToInstruction(mint, ata, payer, mintAmount, [], TOKEN_PROGRAM_ID),
  );

  if (config.revokeMintAuthority) {
    tx.add(
      createSetAuthorityInstruction(
        mint,
        payer,
        AuthorityType.MintTokens,
        null,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
  }

  const signature = await submitTransaction(connection, payer, tx, signTransaction, "Create token", [mintKeypair], { mint: mint.toBase58(), tokenAccount: ata.toBase58(), metadataUri });

  return {
    mint: mint.toBase58(),
    signature,
    tokenAccount: ata.toBase58(),
    metadataUri,
  };
}

async function createTaxToken(
  connection: Connection,
  payer: PublicKey,
  config: TokenConfig,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  mintKeypair: Keypair,
  metadataUri: string,
): Promise<TokenResult> {
  const mint = mintKeypair.publicKey;
  const withdrawAuthority = config.taxWithdrawAuthority
    ? new PublicKey(config.taxWithdrawAuthority)
    : payer;

  // Build Token-2022 metadata for space calculation
  const tokenMetadata: TokenMetadata = {
    mint: mint,
    name: config.name,
    symbol: config.symbol,
    uri: metadataUri,
    additionalMetadata: [],
    updateAuthority: payer,
  };

  const extensions = [
    ExtensionType.TransferFeeConfig,
    ExtensionType.MetadataPointer,
  ];
  const mintLen = getMintLen(extensions);
  const metadataLen = pack(tokenMetadata).length;
  const totalLen = mintLen + metadataLen;
  const lamports = await connection.getMinimumBalanceForRentExemption(
    totalLen + 256,
  );
  const ata = getAssociatedTokenAddressSync(
    mint,
    payer,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const tx = new Transaction();

  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  );

  // Initialize metadata pointer (must come before InitializeMint)
  tx.add(
    createInitializeMetadataPointerInstruction(
      mint,
      payer,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  const maxFee = BigInt(config.maxTaxAmount) * 10n ** BigInt(config.decimals);
  tx.add(
    createInitializeTransferFeeConfigInstruction(
      mint,
      payer,
      withdrawAuthority,
      config.taxBasisPoints,
      maxFee,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx.add(
    createInitializeMintInstruction(
      mint,
      config.decimals,
      payer,
      config.revokeFreezeAuthority ? null : payer,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // Use Token-2022 native metadata instead of Metaplex
  tx.add(
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      mint: mint,
      metadata: mint,
      name: config.name,
      symbol: config.symbol,
      uri: metadataUri,
      mintAuthority: payer,
      updateAuthority: payer,
    }),
  );

  tx.add(
    createAssociatedTokenAccountInstruction(
      payer,
      ata,
      payer,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  const mintAmount = BigInt(config.supply) * 10n ** BigInt(config.decimals);
  tx.add(
    createMintToInstruction(
      mint,
      ata,
      payer,
      mintAmount,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  if (config.revokeMintAuthority) {
    tx.add(
      createSetAuthorityInstruction(
        mint,
        payer,
        AuthorityType.MintTokens,
        null,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  const signature = await submitTransaction(connection, payer, tx, signTransaction, "Create token", [mintKeypair], { mint: mint.toBase58(), tokenAccount: ata.toBase58(), metadataUri });

  return {
    mint: mint.toBase58(),
    signature,
    tokenAccount: ata.toBase58(),
    metadataUri,
  };
}

function buildUpdateMetadataJson(config: UpdateMetadataConfig): object {
  const metadata: Record<string, unknown> = {
    name: config.name,
    symbol: config.symbol,
    description: config.description,
    image: config.image,
  };

  if (config.banner) {
    metadata.banner = config.banner;
  }

  const links: Record<string, string> = {};
  if (config.website) links.website = config.website;
  if (config.twitter) links.twitter = config.twitter;
  if (config.telegram) links.telegram = config.telegram;
  if (config.discord) links.discord = config.discord;

  if (Object.keys(links).length > 0) {
    metadata.external_url = config.website || "";
    metadata.extensions = links;
  }

  return metadata;
}

// Build UpdateMetadataAccountV2 instruction for Metaplex (SPL legacy tokens)
function createUpdateMetadataInstruction(
  metadataPDA: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
): TransactionInstruction {
  const data = Buffer.alloc(1000);
  let offset = 0;

  // Instruction discriminator: UpdateMetadataAccountV2 = 15
  data.writeUInt8(15, offset);
  offset += 1;

  // Option<DataV2> = Some
  data.writeUInt8(1, offset);
  offset += 1;

  // name
  const nameBytes = Buffer.from(name);
  data.writeUInt32LE(nameBytes.length, offset);
  offset += 4;
  nameBytes.copy(data, offset);
  offset += nameBytes.length;

  // symbol
  const symbolBytes = Buffer.from(symbol);
  data.writeUInt32LE(symbolBytes.length, offset);
  offset += 4;
  symbolBytes.copy(data, offset);
  offset += symbolBytes.length;

  // uri
  const uriBytes = Buffer.from(uri);
  data.writeUInt32LE(uriBytes.length, offset);
  offset += 4;
  uriBytes.copy(data, offset);
  offset += uriBytes.length;

  // sellerFeeBasisPoints
  data.writeUInt16LE(0, offset);
  offset += 2;

  // creators: Option<Vec<Creator>> = None
  data.writeUInt8(0, offset);
  offset += 1;

  // collection: Option<Collection> = None
  data.writeUInt8(0, offset);
  offset += 1;

  // uses: Option<Uses> = None
  data.writeUInt8(0, offset);
  offset += 1;

  // newUpdateAuthority: Option<Pubkey> = None
  data.writeUInt8(0, offset);
  offset += 1;

  // primarySaleHappened: Option<bool> = None
  data.writeUInt8(0, offset);
  offset += 1;

  // isMutable: Option<bool> = None
  data.writeUInt8(0, offset);
  offset += 1;

  const accounts = [
    { pubkey: metadataPDA, isSigner: false, isWritable: true },
    { pubkey: updateAuthority, isSigner: true, isWritable: false },
  ];

  return new TransactionInstruction({
    keys: accounts,
    programId: METADATA_PROGRAM_ID,
    data: data.subarray(0, offset),
  });
}

export async function updateTokenMetadata(
  connection: Connection,
  payer: PublicKey,
  mintAddress: string,
  config: UpdateMetadataConfig,
  isToken2022: boolean,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
): Promise<string> {
  const mint = new PublicKey(mintAddress);

  // Upload new metadata JSON to Pinata
  const metadataJson = buildUpdateMetadataJson(config);
  const metadataRes = await fetch("/api/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata: metadataJson, mint: mintAddress }),
  });
  const uploaded = await metadataRes.json();
  if (!metadataRes.ok || typeof uploaded.uri !== "string") throw new Error(uploaded.error || "Metadata upload failed. No transaction was sent.");
  const metadataUri = uploaded.uri;

  const tx = new Transaction();

  if (isToken2022) {
    tx.add(
      createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: payer,
        field: "name",
        value: config.name,
      }),
    );
    tx.add(
      createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: payer,
        field: "symbol",
        value: config.symbol,
      }),
    );
    tx.add(
      createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: payer,
        field: "uri",
        value: metadataUri,
      }),
    );
  } else {
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      METADATA_PROGRAM_ID,
    );
    tx.add(
      createUpdateMetadataInstruction(
        metadataPDA,
        payer,
        config.name,
        config.symbol,
        metadataUri,
      ),
    );
  }

  const signature = await submitTransaction(connection, payer, tx, signTransaction, "Token management");

  return signature;
}

// Harvest withheld transfer fees from token accounts to the mint account
export async function harvestWithheldTokensToMint(
  connection: Connection,
  payer: PublicKey,
  mintAddress: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
): Promise<string> {
  const mint = new PublicKey(mintAddress);

  // Find all token accounts for this mint that have withheld fees
  const accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    filters: [
      { dataSize: 182 }, // Token account with transfer fee extension
      { memcmp: { offset: 0, bytes: mint.toBase58() } },
    ],
  });

  // Try broader search if first one returns nothing
  let tokenAccountKeys: PublicKey[] = [];
  if (accounts.length === 0) {
    const allAccounts = await connection
      .getTokenAccountsByOwner(payer, { mint }, { commitment: "confirmed" })
      .catch(() => null);

    // Also get all accounts for the mint
    const largerAccounts = await connection.getProgramAccounts(
      TOKEN_2022_PROGRAM_ID,
      {
        filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }],
      },
    );

    for (const acc of largerAccounts) {
      try {
        const unpacked = unpackAccount(
          acc.pubkey,
          acc.account,
          TOKEN_2022_PROGRAM_ID,
        );
        const feeAmount = getTransferFeeAmount(unpacked);
        if (feeAmount !== null && feeAmount.withheldAmount > BigInt(0)) {
          tokenAccountKeys.push(acc.pubkey);
        }
      } catch {
        // Skip accounts that can't be unpacked
      }
    }
  } else {
    for (const acc of accounts) {
      try {
        const unpacked = unpackAccount(
          acc.pubkey,
          acc.account,
          TOKEN_2022_PROGRAM_ID,
        );
        const feeAmount = getTransferFeeAmount(unpacked);
        if (feeAmount !== null && feeAmount.withheldAmount > BigInt(0)) {
          tokenAccountKeys.push(acc.pubkey);
        }
      } catch {
        // Skip
      }
    }
  }

  if (tokenAccountKeys.length === 0) {
    throw new Error("No token accounts with withheld fees found");
  }

  const tx = new Transaction();

  // Process in batches of ~20 to fit in transaction size
  const batch = tokenAccountKeys.slice(0, 20);
  tx.add(
    createHarvestWithheldTokensToMintInstruction(
      mint,
      batch,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  const signature = await submitTransaction(connection, payer, tx, signTransaction, "Token management");

  return signature;
}

// Withdraw withheld transfer fees from the mint to a destination account
export async function withdrawWithheldTokensFromMint(
  connection: Connection,
  payer: PublicKey,
  mintAddress: string,
  destinationAddress: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
): Promise<string> {
  const mint = new PublicKey(mintAddress);
  const destination = new PublicKey(destinationAddress);

  const tx = new Transaction();

  // Ensure destination ATA exists
  try {
    await getAccount(
      connection,
      destination,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
  } catch {
    // If destination is a wallet, create ATA
    try {
      const destOwner = destination;
      const ata = getAssociatedTokenAddressSync(
        mint,
        destOwner,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer,
          ata,
          destOwner,
          mint,
          TOKEN_2022_PROGRAM_ID,
        ),
      );
      // Use the ATA as actual destination
      tx.add(
        createWithdrawWithheldTokensFromMintInstruction(
          mint,
          ata,
          payer,
          [],
          TOKEN_2022_PROGRAM_ID,
        ),
      );

      const signature = await submitTransaction(connection, payer, tx, signTransaction, "Token management");
      return signature;
    } catch {
      // Fall through to direct withdraw
    }
  }

  tx.add(
    createWithdrawWithheldTokensFromMintInstruction(
      mint,
      destination,
      payer,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  const signature = await submitTransaction(connection, payer, tx, signTransaction, "Token management");

  return signature;
}

// Withdraw withheld fees directly from token accounts (skipping mint)
export async function withdrawWithheldTokensFromAccounts(
  connection: Connection,
  payer: PublicKey,
  mintAddress: string,
  destinationAta: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
): Promise<string> {
  const mint = new PublicKey(mintAddress);
  const destination = new PublicKey(destinationAta);

  // Find accounts with withheld fees
  const allAccounts = await connection.getProgramAccounts(
    TOKEN_2022_PROGRAM_ID,
    {
      filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }],
    },
  );

  const tokenAccountKeys: PublicKey[] = [];
  for (const acc of allAccounts) {
    try {
      const unpacked = unpackAccount(
        acc.pubkey,
        acc.account,
        TOKEN_2022_PROGRAM_ID,
      );
      const feeAmount = getTransferFeeAmount(unpacked);
      if (feeAmount !== null && feeAmount.withheldAmount > BigInt(0)) {
        tokenAccountKeys.push(acc.pubkey);
      }
    } catch {
      // Skip
    }
  }

  if (tokenAccountKeys.length === 0) {
    throw new Error("No token accounts with withheld fees found");
  }

  const tx = new Transaction();
  const batch = tokenAccountKeys.slice(0, 20);
  tx.add(
    createWithdrawWithheldTokensFromAccountsInstruction(
      mint,
      destination,
      payer,
      [],
      batch,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  const signature = await submitTransaction(connection, payer, tx, signTransaction, "Token management");

  return signature;
}
