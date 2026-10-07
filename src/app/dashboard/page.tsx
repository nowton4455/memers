"use client";

import { useState, useCallback, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  createBurnInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import toast from "react-hot-toast";
import {
  Search,
  Coins,
  Flame,
  Shield,
  ShieldOff,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Info,
  Snowflake,
  Key,
  FileEdit,
  Globe,
  Twitter,
  MessageCircle,
  Hash,
  ChevronDown,
  ChevronUp,
  Wallet,
  ArrowDownToLine,
  Sparkles,
  Layers,
} from "lucide-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { parseAmount, formatAmount } from "@/lib/amount";
import { submitTransaction } from "@/lib/transaction";
import ImageUpload from "@/components/ImageUpload";
import {
  updateTokenMetadata,
  UpdateMetadataConfig,
  harvestWithheldTokensToMint,
  withdrawWithheldTokensFromMint,
  withdrawWithheldTokensFromAccounts,
} from "@/lib/token";

interface TokenInfo {
  address: string;
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isToken2022: boolean;
  userBalance: string;
  userAta: string;
}

export default function Dashboard() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  useEffect(() => { const mint = new URLSearchParams(window.location.search).get("mint"); if(mint) setMintAddress(mint); }, []);
  const [mintAddress, setMintAddress] = useState("");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [copied, setCopied] = useState("");

  const [mintAmount, setMintAmount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [withdrawDestination, setWithdrawDestination] = useState("");

  const [showMetadata, setShowMetadata] = useState(false);
  const [metaForm, setMetaForm] = useState<UpdateMetadataConfig>({
    name: "",
    symbol: "",
    description: "",
    image: "",
    banner: "",
    website: "",
    twitter: "",
    telegram: "",
    discord: "",
  });

  const updateMeta = (key: keyof UpdateMetadataConfig, value: string) =>
    setMetaForm((prev) => ({ ...prev, [key]: value }));

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(""), 2000); }).catch(() => toast.error("Copy unavailable. Select the address to copy it."));
  };

  const loadToken = useCallback(async () => {
    if (!mintAddress || !publicKey) {
      toast.error(!publicKey ? "Connect your wallet" : "Enter a mint address");
      return;
    }

    setLoading(true);
    setTokenInfo(null);
    try {
      const mint = new PublicKey(mintAddress);

      let mintData;
      let isToken2022 = false;
      try {
        mintData = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
        isToken2022 = true;
      } catch {
        mintData = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);
      }

      const programId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const ata = getAssociatedTokenAddressSync(mint, publicKey, false, programId);

      let balance = "0";
      try {
        const account = await getAccount(connection, ata, "confirmed", programId);
        balance = formatAmount(account.amount, mintData.decimals);
      } catch {
        // ATA doesn't exist yet
      }

      setTokenInfo({
        address: mint.toBase58(),
        decimals: mintData.decimals,
        supply: formatAmount(mintData.supply, mintData.decimals),
        mintAuthority: mintData.mintAuthority?.toBase58() || null,
        freezeAuthority: mintData.freezeAuthority?.toBase58() || null,
        isToken2022,
        userBalance: balance,
        userAta: ata.toBase58(),
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load token. Check the mint address.");
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey, mintAddress]);

  const executeAction = async (action: string, buildTx: () => Promise<Transaction>) => {
    if (!publicKey || !signTransaction) return;
    setActionLoading(action);
    try {
      const tx = await buildTx();
      await submitTransaction(connection, publicKey, tx, signTransaction, action);
      toast.success(`${action} successful!`);
      await loadToken();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${action} failed`;
      toast.error(msg);
    } finally {
      setActionLoading("");
    }
  };

  const handleMint = () => {
    if (!tokenInfo || !publicKey || !mintAmount) return;
    const programId = tokenInfo.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mint = new PublicKey(tokenInfo.address);
    const ata = getAssociatedTokenAddressSync(mint, publicKey, false, programId);
    let amount: bigint;
    try { amount = parseAmount(mintAmount, tokenInfo.decimals); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Invalid amount"); return; }

    executeAction("Mint", async () => {
      const tx = new Transaction();
      try {
        await getAccount(connection, ata, "confirmed", programId);
      } catch {
        tx.add(
          createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint, programId)
        );
      }
      tx.add(createMintToInstruction(mint, ata, publicKey, amount, [], programId));
      return tx;
    });
  };

  const handleBurn = () => {
    if (!tokenInfo || !publicKey || !burnAmount) return;
    const programId = tokenInfo.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mint = new PublicKey(tokenInfo.address);
    const ata = getAssociatedTokenAddressSync(mint, publicKey, false, programId);
    let amount: bigint;
    try { amount = parseAmount(burnAmount, tokenInfo.decimals); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Invalid amount"); return; }

    executeAction("Burn", async () => {
      const tx = new Transaction();
      tx.add(createBurnInstruction(ata, mint, publicKey, amount, [], programId));
      return tx;
    });
  };

  const handleRevokeAuthority = (type: "mint" | "freeze") => {
    if (!tokenInfo || !publicKey) return;
    const programId = tokenInfo.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mint = new PublicKey(tokenInfo.address);
    const authType = type === "mint" ? AuthorityType.MintTokens : AuthorityType.FreezeAccount;

    executeAction(`Revoke ${type} authority`, async () => {
      const tx = new Transaction();
      tx.add(createSetAuthorityInstruction(mint, publicKey, authType, null, [], programId));
      return tx;
    });
  };

  const handleHarvestToMint = async () => {
    if (!tokenInfo || !publicKey || !signTransaction) return;
    setActionLoading("Harvest");
    try {
      const sig = await harvestWithheldTokensToMint(
        connection,
        publicKey,
        tokenInfo.address,
        signTransaction
      );
      toast.success("Fees harvested to mint successfully!");
      console.log("Harvest tx:", sig);
      await loadToken();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Harvest failed";
      toast.error(msg);
    } finally {
      setActionLoading("");
    }
  };

  const handleWithdrawFromMint = async () => {
    if (!tokenInfo || !publicKey || !signTransaction) return;
    const dest = withdrawDestination.trim() || publicKey.toBase58();
    setActionLoading("Withdraw from Mint");
    try {
      const sig = await withdrawWithheldTokensFromMint(
        connection,
        publicKey,
        tokenInfo.address,
        dest,
        signTransaction
      );
      toast.success("Fees withdrawn from mint successfully!");
      console.log("Withdraw from mint tx:", sig);
      await loadToken();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Withdraw failed";
      toast.error(msg);
    } finally {
      setActionLoading("");
    }
  };

  const handleWithdrawFromAccounts = async () => {
    if (!tokenInfo || !publicKey || !signTransaction) return;
    setActionLoading("Withdraw from Accounts");
    try {
      const ata = getAssociatedTokenAddressSync(
        new PublicKey(tokenInfo.address),
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const sig = await withdrawWithheldTokensFromAccounts(
        connection,
        publicKey,
        tokenInfo.address,
        ata.toBase58(),
        signTransaction
      );
      toast.success("Fees withdrawn from accounts successfully!");
      console.log("Withdraw from accounts tx:", sig);
      await loadToken();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Withdraw failed";
      toast.error(msg);
    } finally {
      setActionLoading("");
    }
  };

  const handleUpdateMetadata = async () => {
    if (!tokenInfo || !publicKey || !signTransaction) return;
    if (!metaForm.name || !metaForm.symbol || !metaForm.image) {
      toast.error("Name, symbol, and image are required");
      return;
    }

    setActionLoading("Update Metadata");
    try {
      const upload = async (file: File) => {
        const data = new FormData(); data.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body: data });
        const result = await response.json();
        if (!response.ok || !result.url) throw new Error(result.error || "Image upload failed");
        return result.url as string;
      };
      const metadata = { ...metaForm, image: logoFile ? await upload(logoFile) : metaForm.image,
        banner: bannerFile ? await upload(bannerFile) : metaForm.banner };
      setMetaForm(metadata); setLogoFile(null); setBannerFile(null);
      const signature = await updateTokenMetadata(
        connection,
        publicKey,
        tokenInfo.address,
        metadata,
        tokenInfo.isToken2022,
        signTransaction
      );
      toast.success("Metadata updated successfully!");
      console.log("Update metadata tx:", signature);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Metadata update failed";
      toast.error(msg);
    } finally {
      setActionLoading("");
    }
  };

  const isMyAuthority = (auth: string | null) =>
    auth && publicKey && auth === publicKey.toBase58();

  return (
    <div className="max-w-5xl mx-auto px-4">
      {/* Hero */}
      <div className="text-center mb-10 fade-up">
        <span className="chip bg-white/5 text-white/70 border border-white/10 mb-5">
          <Layers className="w-3 h-3 text-solana-purple" /> Token management
          console
        </span>
        <h1 className="display-font text-4xl md:text-5xl font-bold leading-tight mb-3">
          Control every <span className="gradient-text-solana">token</span> you&apos;ve minted
        </h1>
        <p className="text-white/55 text-base max-w-xl mx-auto">
          Load any mint to mint, burn, update metadata, manage authorities or
          harvest transfer fees in one place.
        </p>
      </div>

      {/* Search */}
      <div className="glass-strong glow-border rounded-2xl p-5 mb-6 scale-in">
        <label className="block text-xs font-medium text-white/60 mb-2 uppercase tracking-wider">
          Token mint address
        </label>
        <div className="flex gap-3 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={mintAddress}
              onChange={(e) => setMintAddress(e.target.value.trim())}
              placeholder="Paste a mint address, e.g. EPjF…TDt1v"
              className="field !pl-11 font-mono text-sm"
              onKeyDown={(e) => e.key === "Enter" && loadToken()}
            />
          </div>
          <button
            onClick={loadToken}
            disabled={loading || !connected}
            className="btn-primary flex items-center justify-center gap-2 px-6 py-3 rounded-xl sm:min-w-[140px]"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Search className="w-4 h-4" /> Load
              </>
            )}
          </button>
        </div>
      </div>

      {!connected && (
        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-4 flex gap-3 mb-6 fade-up">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-200/90">
            Connect your wallet to load and manage tokens. <button className="primary-action" onClick={() => setVisible(true)}>Connect wallet</button>
          </p>
        </div>
      )}

      {tokenInfo && (
        <div className="space-y-6 fade-up">
          {/* Token Overview */}
          <div className="glass-strong glow-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="display-font text-lg font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-solana-purple/15 text-solana-purple border border-solana-purple/25">
                  <Info className="w-4 h-4" />
                </div>
                Token overview
              </h2>
              <span
                className={`chip ${
                  tokenInfo.isToken2022
                    ? "bg-solana-green/10 text-solana-green border border-solana-green/25"
                    : "bg-solana-purple/10 text-solana-purple border border-solana-purple/25"
                }`}
              >
                <Sparkles className="w-3 h-3" />
                {tokenInfo.isToken2022 ? "Token-2022" : "SPL Token"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DashInfoRow
                label="Mint address"
                value={tokenInfo.address}
                mono
                copyable
                onCopy={() => copyText(tokenInfo.address, "addr")}
                copied={copied === "addr"}
              />
              <DashInfoRow
                label="Total supply"
                value={tokenInfo.supply}
                highlight="green"
              />
              <DashInfoRow label="Decimals" value={String(tokenInfo.decimals)} />
              <DashInfoRow
                label="Your balance"
                value={tokenInfo.userBalance}
                highlight="purple"
              />
              <DashInfoRow
                label="Mint authority"
                value={tokenInfo.mintAuthority || "Revoked"}
                mono={!!tokenInfo.mintAuthority}
                highlight={
                  !tokenInfo.mintAuthority
                    ? "green"
                    : isMyAuthority(tokenInfo.mintAuthority)
                    ? "purple"
                    : undefined
                }
              />
              <DashInfoRow
                label="Freeze authority"
                value={tokenInfo.freezeAuthority || "Revoked"}
                mono={!!tokenInfo.freezeAuthority}
                highlight={
                  !tokenInfo.freezeAuthority
                    ? "green"
                    : isMyAuthority(tokenInfo.freezeAuthority)
                    ? "purple"
                    : undefined
                }
              />
            </div>

            <a
              href={`https://solscan.io/token/${tokenInfo.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-5 text-sm text-solana-purple hover:text-solana-green transition-colors"
            >
              View on Solscan <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Update Metadata (collapsible) */}
          <div className="glass-strong glow-border rounded-2xl p-6">
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="w-full flex items-center justify-between text-left group"
            >
              <h3 className="display-font text-lg font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-solana-purple/15 text-solana-purple border border-solana-purple/25">
                  <FileEdit className="w-4 h-4" />
                </div>
                Update metadata
              </h3>
              <div className="p-1.5 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                {showMetadata ? (
                  <ChevronUp className="w-4 h-4 text-white/60" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white/60" />
                )}
              </div>
            </button>

            {showMetadata && (
              <div className="mt-6 space-y-6 fade-up">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <DashField label="Token name" required>
                    <input
                      className="field"
                      type="text"
                      value={metaForm.name}
                      onChange={(e) => updateMeta("name", e.target.value)}
                      placeholder="e.g. My Token"
                    />
                  </DashField>
                  <DashField label="Symbol" required>
                    <input
                      className="field font-mono uppercase"
                      type="text"
                      value={metaForm.symbol}
                      onChange={(e) => updateMeta("symbol", e.target.value.toUpperCase())}
                      placeholder="e.g. MTK"
                      maxLength={10}
                    />
                  </DashField>
                </div>

                <DashField label="Description">
                  <textarea
                    className="field resize-none"
                    rows={3}
                    value={metaForm.description}
                    onChange={(e) => updateMeta("description", e.target.value)}
                    placeholder="Describe your token…"
                  />
                </DashField>

                <div className="flex flex-col md:flex-row gap-5 md:items-start">
                  <ImageUpload
                    onFileChange={setLogoFile}
                    label="Token logo *"
                    value={metaForm.image}
                    onChange={(v) => updateMeta("image", v)}
                    aspect="square"
                  />
                  <div className="flex-1 min-w-0">
                    <ImageUpload
                      onFileChange={setBannerFile}
                      label="Banner"
                      value={metaForm.banner || ""}
                      onChange={(v) => updateMeta("banner", v)}
                      aspect="banner"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <IconField
                    icon={Globe}
                    label="Website"
                    placeholder="https://yourtoken.com"
                    value={metaForm.website || ""}
                    onChange={(v) => updateMeta("website", v)}
                  />
                  <IconField
                    icon={Twitter}
                    label="Twitter / X"
                    placeholder="https://x.com/yourtoken"
                    value={metaForm.twitter || ""}
                    onChange={(v) => updateMeta("twitter", v)}
                  />
                  <IconField
                    icon={MessageCircle}
                    label="Telegram"
                    placeholder="https://t.me/yourtoken"
                    value={metaForm.telegram || ""}
                    onChange={(v) => updateMeta("telegram", v)}
                  />
                  <IconField
                    icon={Hash}
                    label="Discord"
                    placeholder="https://discord.gg/yourtoken"
                    value={metaForm.discord || ""}
                    onChange={(v) => updateMeta("discord", v)}
                  />
                </div>

                <button
                  onClick={handleUpdateMetadata}
                  disabled={
                    !!actionLoading ||
                    !metaForm.name ||
                    !metaForm.symbol ||
                    !metaForm.image
                  }
                  className="btn-primary w-full py-3.5 rounded-xl"
                >
                  {actionLoading === "Update Metadata" ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-black/50 border-t-transparent rounded-full animate-spin" />
                      Updating…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <FileEdit className="w-4 h-4" /> Update metadata
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Action cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Mint */}
            <ActionCard
              title="Mint tokens"
              icon={Coins}
              accent="green"
              disabled={!isMyAuthority(tokenInfo.mintAuthority)}
              disabledMessage={
                tokenInfo.mintAuthority
                  ? "You are not the mint authority."
                  : "Mint authority has been revoked."
              }
            >
              <input
                type="number"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                placeholder="Amount to mint"
                min={0}
                className="field mb-3"
              />
              <button
                onClick={handleMint}
                disabled={!!actionLoading || !mintAmount}
                className="w-full py-3 rounded-xl bg-solana-green/15 text-solana-green font-semibold border border-solana-green/25 hover:bg-solana-green/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLoading === "Mint" ? "Minting…" : "Mint tokens"}
              </button>
            </ActionCard>

            {/* Burn */}
            <ActionCard title="Burn tokens" icon={Flame} accent="orange">
              <input
                type="number"
                value={burnAmount}
                onChange={(e) => setBurnAmount(e.target.value)}
                placeholder="Amount to burn"
                min={0}
                className="field mb-3"
              />
              <button
                onClick={handleBurn}
                disabled={!!actionLoading || !burnAmount}
                className="w-full py-3 rounded-xl bg-orange-500/15 text-orange-400 font-semibold border border-orange-500/25 hover:bg-orange-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLoading === "Burn" ? "Burning…" : "Burn tokens"}
              </button>
            </ActionCard>

            {/* Revoke Mint Authority */}
            <ActionCard
              title="Mint authority"
              icon={Key}
              accent="red"
              disabled={!isMyAuthority(tokenInfo.mintAuthority)}
              disabledMessage={
                tokenInfo.mintAuthority ? "Not your authority" : "Already revoked"
              }
              disabledIcon={Shield}
            >
              <p className="text-sm text-white/55 mb-4">
                Permanently revoke the ability to mint new tokens. This cannot
                be undone.
              </p>
              <button
                onClick={() => handleRevokeAuthority("mint")}
                disabled={!!actionLoading}
                className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-semibold border border-red-500/25 hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLoading === "Revoke mint authority"
                  ? "Revoking…"
                  : "Revoke mint authority"}
              </button>
            </ActionCard>

            {/* Revoke Freeze Authority */}
            <ActionCard
              title="Freeze authority"
              icon={Snowflake}
              accent="blue"
              disabled={!isMyAuthority(tokenInfo.freezeAuthority)}
              disabledMessage={
                tokenInfo.freezeAuthority ? "Not your authority" : "Already revoked"
              }
              disabledIcon={ShieldOff}
            >
              <p className="text-sm text-white/55 mb-4">
                Permanently revoke the ability to freeze token accounts. This
                cannot be undone.
              </p>
              <button
                onClick={() => handleRevokeAuthority("freeze")}
                disabled={!!actionLoading}
                className="w-full py-3 rounded-xl bg-blue-500/15 text-blue-400 font-semibold border border-blue-500/25 hover:bg-blue-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLoading === "Revoke freeze authority"
                  ? "Revoking…"
                  : "Revoke freeze authority"}
              </button>
            </ActionCard>
          </div>

          {/* Token-2022 Transfer Fee */}
          {tokenInfo.isToken2022 && (
            <div className="glass-strong glow-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-solana-green/15 text-solana-green border border-solana-green/25">
                  <Wallet className="w-4 h-4" />
                </div>
                <h3 className="display-font text-lg font-semibold">
                  Transfer fee harvest & withdraw
                </h3>
              </div>
              <p className="text-sm text-white/55 mb-6 max-w-2xl">
                Collect withheld transfer fees from token accounts. First
                harvest fees to the mint, then withdraw them to your wallet.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Harvest to Mint */}
                <SubAction
                  icon={ArrowDownToLine}
                  title="Harvest to mint"
                  description="Collect withheld fees from all token accounts into the mint account."
                  accent="yellow"
                >
                  <button
                    onClick={handleHarvestToMint}
                    disabled={!!actionLoading}
                    className="w-full py-2.5 rounded-xl bg-yellow-500/15 text-yellow-400 font-semibold border border-yellow-500/25 hover:bg-yellow-500/25 transition-colors disabled:opacity-40 text-sm"
                  >
                    {actionLoading === "Harvest" ? "Harvesting…" : "Harvest fees"}
                  </button>
                </SubAction>

                {/* Withdraw from Mint */}
                <SubAction
                  icon={Wallet}
                  title="Withdraw from mint"
                  description="Withdraw collected fees from the mint to your wallet."
                  accent="green"
                >
                  <input
                    type="text"
                    value={withdrawDestination}
                    onChange={(e) => setWithdrawDestination(e.target.value.trim())}
                    placeholder="Destination (default: your wallet)"
                    className="field font-mono text-[11px] mb-2 !py-2"
                  />
                  <button
                    onClick={handleWithdrawFromMint}
                    disabled={!!actionLoading}
                    className="w-full py-2.5 rounded-xl bg-solana-green/15 text-solana-green font-semibold border border-solana-green/25 hover:bg-solana-green/25 transition-colors disabled:opacity-40 text-sm"
                  >
                    {actionLoading === "Withdraw from Mint"
                      ? "Withdrawing…"
                      : "Withdraw from mint"}
                  </button>
                </SubAction>

                {/* Withdraw from Accounts */}
                <SubAction
                  icon={Coins}
                  title="Withdraw from accounts"
                  description="Withdraw fees directly from token accounts to your wallet (skips mint)."
                  accent="purple"
                >
                  <button
                    onClick={handleWithdrawFromAccounts}
                    disabled={!!actionLoading}
                    className="w-full py-2.5 rounded-xl bg-solana-purple/15 text-solana-purple font-semibold border border-solana-purple/25 hover:bg-solana-purple/25 transition-colors disabled:opacity-40 text-sm"
                  >
                    {actionLoading === "Withdraw from Accounts"
                      ? "Withdrawing…"
                      : "Withdraw from accounts"}
                  </button>
                </SubAction>
              </div>

              <div className="mt-5 rounded-xl border border-yellow-400/15 bg-yellow-400/5 p-3">
                <p className="text-xs text-yellow-200/85 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  You must be the withdraw authority to withdraw fees. Harvest
                  is permissionless (anyone can call it).
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {!tokenInfo && connected && !loading && (
        <EmptyState />
      )}
    </div>
  );
}

/* ---------- UI primitives ---------- */

function EmptyState() {
  return (
    <div className="glass rounded-2xl p-12 text-center fade-up">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-solana-purple/30 to-solana-green/20 border border-white/10 flex items-center justify-center">
        <Search className="w-6 h-6 text-white/60" />
      </div>
      <h3 className="display-font text-lg font-semibold mb-1">
        No token loaded yet
      </h3>
      <p className="text-sm text-white/50 max-w-sm mx-auto">
        Paste a mint address above and press Load to see full token details
        and management actions.
      </p>
    </div>
  );
}

function DashField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-white/60 mb-2 uppercase tracking-wider">
        {label}
        {required && <span className="text-solana-pink">*</span>}
      </label>
      {children}
    </div>
  );
}

function IconField({
  icon: Icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/60 mb-2 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="field !pl-11"
        />
      </div>
    </div>
  );
}

function ActionCard({
  title,
  icon: Icon,
  accent,
  disabled,
  disabledMessage,
  disabledIcon: DisabledIcon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "green" | "orange" | "red" | "blue" | "purple";
  disabled?: boolean;
  disabledMessage?: string;
  disabledIcon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const accentMap = {
    green: "bg-solana-green/15 text-solana-green border-solana-green/25",
    orange: "bg-orange-500/15 text-orange-400 border-orange-500/25",
    red: "bg-red-500/15 text-red-400 border-red-500/25",
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    purple: "bg-solana-purple/15 text-solana-purple border-solana-purple/25",
  } as const;

  return (
    <div className="glass-strong glow-border rounded-2xl p-6 card-hover">
      <h3 className="display-font text-base font-semibold flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded-lg border ${accentMap[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
        {title}
      </h3>
      {disabled ? (
        <div className="flex items-center gap-2 text-sm text-white/45 py-2">
          {DisabledIcon && <DisabledIcon className="w-4 h-4" />}
          {disabledMessage}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function SubAction({
  icon: Icon,
  title,
  description,
  accent,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: "yellow" | "green" | "purple";
  children: React.ReactNode;
}) {
  const accentMap = {
    yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
    green: "bg-solana-green/15 text-solana-green border-solana-green/25",
    purple: "bg-solana-purple/15 text-solana-purple border-solana-purple/25",
  } as const;

  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 flex flex-col">
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
        <div className={`p-1 rounded-md border ${accentMap[accent]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        {title}
      </h4>
      <p className="text-xs text-white/50 mb-3 leading-relaxed flex-1">
        {description}
      </p>
      {children}
    </div>
  );
}

function DashInfoRow({
  label,
  value,
  mono,
  copyable,
  onCopy,
  copied,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
  copied?: boolean;
  highlight?: "green" | "purple";
}) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5 hover:border-white/10 transition-colors">
      <label className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2 mt-1">
        <p
          className={`text-sm break-all flex-1 ${mono ? "font-mono" : "font-medium"} ${
            highlight === "green"
              ? "text-solana-green"
              : highlight === "purple"
              ? "text-solana-purple"
              : "text-white"
          }`}
        >
          {value}
        </p>
        {copyable && onCopy && (
          <button
            onClick={onCopy}
            className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
            aria-label="Copy"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-solana-green" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-white/50" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
