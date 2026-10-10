"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  LockKeyhole,
  MessageCircle,
  Rocket,
  ShieldCheck,
  Sparkles,
  Twitter,
  UploadCloud,
} from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import { createToken, TokenConfig } from "@/lib/token";
import { PLATFORM_RECEIVING_WALLET, platformFeeSol } from "@/lib/fees";
import { assertNoPending, PendingTransaction } from "@/lib/transaction";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

type Result = { mint: string; signature: string } | null;
const steps = [
  { n: 1, label: "Token Details" },
  { n: 2, label: "Supply & Description" },
  { n: 3, label: "Socials & Authorities" },
];

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible: setWalletVisible } = useWalletModal();
  const [storageError, setStorageError] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [copied, setCopied] = useState(false);
  const [modifyCreator, setModifyCreator] = useState(false);
  const [creatorName, setCreatorName] = useState("");
  const [creatorWebsite, setCreatorWebsite] = useState("");
  const [form, setForm] = useState<TokenConfig>({
    name: "",
    symbol: "",
    decimals: 9,
    supply: 1000000000,
    description: "",
    image: "",
    banner: "",
    website: "",
    twitter: "",
    telegram: "",
    discord: "",
    enableTax: false,
    taxBasisPoints: 0,
    maxTaxAmount: 0,
    taxWithdrawAuthority: "",
    revokeMintAuthority: false,
    revokeFreezeAuthority: false,
    revokeUpdateAuthority: false,
    creatorName: "",
    creatorWebsite: "",
  });
  const update = <K extends keyof TokenConfig>(key: K, value: TokenConfig[K]) =>
    setForm((p) => ({ ...p, [key]: value }));
  useEffect(() => {
    const draft = sessionStorage.getItem("memers-copy-v1");
    if (!draft) return;
    try {
      const coin = JSON.parse(draft);
      if (typeof coin.name === "string" && typeof coin.symbol === "string")
        setForm((p) => ({
          ...p,
          name: coin.name.slice(0, 32),
          symbol: coin.symbol.slice(0, 8),
          image: typeof coin.image === "string" ? coin.image : "",
          description:
            typeof coin.description === "string" ? coin.description : "",
        }));
    } catch {}
    sessionStorage.removeItem("memers-copy-v1");
  }, []);
  useEffect(() => {
    const confirmed = (event: Event) => {
      const pending = (event as CustomEvent<PendingTransaction>).detail;
      if (pending.label === "Create token" && pending.wallet === publicKey?.toBase58() && pending.endpoint === connection.rpcEndpoint && pending.details?.mint)
        setResult({ mint: pending.details.mint, signature: pending.signature });
    };
    window.addEventListener("memers-confirmed", confirmed);
    return () => window.removeEventListener("memers-confirmed", confirmed);
  }, [publicKey, connection]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then(async response => { const status = await response.json(); if (!response.ok || !status.ready) setStorageError(status.message || "Token storage is unavailable."); })
      .catch(() => { if(!controller.signal.aborted) setStorageError("Could not check token storage. The launch will check again before requesting a wallet signature."); });
    return () => controller.abort();
  }, []);
  const canNext = useMemo(() => {
    if (step === 1)
      return Boolean(form.name.trim() && form.symbol.trim() && form.image && new TextEncoder().encode(form.name.trim()).length <= 32 && new TextEncoder().encode(form.symbol.trim()).length <= 10);
    if (step === 2)
      return (
        Number.isSafeInteger(form.supply) &&
        form.supply > 0 &&
        Number.isInteger(form.decimals) &&
        form.decimals >= 0 &&
        form.decimals <= 9 &&
        BigInt(form.supply) * 10n ** BigInt(form.decimals) <=
          18446744073709551615n
      );
    return true;
  }, [step, form]);

  const launch = async () => {
    if (!publicKey || !signTransaction || !connected) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!form.name.trim() || !form.symbol.trim() || !form.image) {
      toast.error("Complete the required token details");
      setStep(1);
      return;
    }
    setLoading(true);
    try {
      assertNoPending(connection, publicKey);
      const readiness = await fetch("/api/health", { cache: "no-store" });
      const status = await readiness.json();
      if (!readiness.ok || !status.ready) { setStorageError(status.message || "Token storage is unavailable."); throw new Error(status.message || "Token storage is unavailable."); }
      setStorageError("");
      let image = form.image;
      if (imageFile) {
        const data = new FormData();
        data.append("file", imageFile);
        const response = await fetch("/api/upload", {
          method: "POST",
          body: data,
        });
        const uploaded = await response.json();
        if (!response.ok || !uploaded.url)
          throw new Error(uploaded.error || "Image upload failed");
        image = uploaded.url;
      }

      const finalForm: TokenConfig = {
        ...form,
        image,
        name: form.name.trim(), symbol: form.symbol.trim(),
        creatorName: modifyCreator ? creatorName.trim() : "",
        creatorWebsite: modifyCreator ? creatorWebsite.trim() : "",
      };
      const res = await createToken(
        connection,
        publicKey,
        finalForm,
        signTransaction,
        window.location.origin,
      );
      setResult({ mint: res.mint, signature: res.signature });
      toast.success("Token created successfully");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Token creation failed",
      );
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <section className="launch-shell">
        {storageError && <p className="pools-error" role="alert">{storageError}</p>}
        <div className="success-card">
          <div className="success-icon">
            <Check />
          </div>
          <div className="eyebrow">TOKEN CREATED</div>
          <h1>Your coin is live.</h1>
          <p>
            Your Solana token has been created successfully. Save the mint
            address below.
          </p>
          <div className="result-box">
            <span>Mint Address</span>
            <code>{result.mint}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(result.mint).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => toast.error("Copy unavailable. Select the mint address to copy it."));
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="success-actions">
            <a
              href={"https://solscan.io/token/" + result.mint + (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : "")}
              target="_blank"
              rel="noreferrer"
            >
              View on Solscan <ExternalLink size={16} />
            </a>
            <a href={"/liquidity?mint=" + result.mint}>Create liquidity pool <ArrowRight size={16}/></a>
            <button
              onClick={() => {
                setResult(null);
                setStep(1);
                setImageFile(null);
                setModifyCreator(false);
                setCreatorName("");
                setCreatorWebsite("");
                setForm({
                  name: "", symbol: "", decimals: 9, supply: 1000000000,
                  description: "", image: "", banner: "", website: "", twitter: "",
                  telegram: "", discord: "", enableTax: false, taxBasisPoints: 0,
                  maxTaxAmount: 0, taxWithdrawAuthority: "", revokeMintAuthority: false,
                  revokeFreezeAuthority: false, revokeUpdateAuthority: false,
                  creatorName: "", creatorWebsite: ""
                });
              }}
            >
              Create another token
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="launch-shell">
        {storageError && <p className="pools-error" role="alert">{storageError}</p>}
        <div className="launch-hero">
          <h1>Launch Your Own Coin FAST ⚡</h1>
          <p>Launch your own token on Solana in seconds. No coding required.</p>
        </div>

        <div className="stepper">
          {steps.map((item, index) => (
            <div
              className={"step-wrap " + (step >= item.n ? "active" : "")}
              key={item.n}
            >
              <button
                className="step-dot"
                onClick={() => item.n <= step && setStep(item.n)}
              >
                {step > item.n ? <Check size={16} /> : item.n}
              </button>
              {index < steps.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>

        <div className="creator-card">
          {step === 1 && (
            <div className="panel-animate">
              <div className="form-grid two">
                <label>
                  <span>Token Name</span>
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="My Meme Coin"
                    maxLength={32}
                  />
                </label>
                <label>
                  <span>Token Symbol</span>
                  <input
                    value={form.symbol}
                    onChange={(e) =>
                      update("symbol", e.target.value.toUpperCase())
                    }
                    placeholder="MEME"
                    maxLength={8}
                  />
                </label>
              </div>
              <div className="upload-shell">
                <div className="upload-title">Token Image</div>
                <ImageUpload
                  label=""
                  value={form.image}
                  onChange={(url) => update("image", url)}
                  onFileChange={setImageFile}
                  aspect="banner"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="panel-animate">
              <div className="form-grid two">
                <label>
                  <span>Decimals</span>
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={form.decimals}
                    onChange={(e) =>
                      update(
                        "decimals",
                        Math.max(0, Math.min(9, Number(e.target.value))),
                      )
                    }
                  />
                  <small>
                    0 for Whitelist, 5 for utility, 9 for meme coins.
                  </small>
                </label>
                <label>
                  <span>Total Supply</span>
                  <input
                    type="number"
                    min={1}
                    value={form.supply}
                    onChange={(e) => update("supply", Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="full-label">
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Describe your token..."
                  rows={5}
                />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="panel-animate">
              <div className="social-grid">
                <SocialInput
                  icon={<Globe2 size={17} />}
                  label="Website"
                  value={form.website || ""}
                  placeholder="https://yourcoin.com"
                  onChange={(v) => update("website", v)}
                />
                <SocialInput
                  icon={<Twitter size={17} />}
                  label="Twitter / X"
                  value={form.twitter || ""}
                  placeholder="https://x.com/yourcoin"
                  onChange={(v) => update("twitter", v)}
                />
                <SocialInput
                  icon={<MessageCircle size={17} />}
                  label="Telegram"
                  value={form.telegram || ""}
                  placeholder="https://t.me/yourcoin"
                  onChange={(v) => update("telegram", v)}
                />
                <SocialInput
                  icon={<MessageCircle size={17} />}
                  label="Discord"
                  value={form.discord || ""}
                  placeholder="https://discord.gg/yourcoin"
                  onChange={(v) => update("discord", v)}
                />
              </div>
              <div className="creator-info">
                <div>
                  <h3>Modify Creator Information</h3>
                  <p>Change the information of the creator in the metadata.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Modify Creator Information"
                  aria-checked={modifyCreator}
                  className={"toggle " + (modifyCreator ? "toggle-on" : "")}
                  onClick={() => setModifyCreator(!modifyCreator)}
                />
              </div>
              {modifyCreator && (
                <div className="creator-fields">
                  <input
                    aria-label="Creator name"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder="Your name or organization"
                  />
                  <input
                    aria-label="Creator website"
                    value={creatorWebsite}
                    onChange={(e) => setCreatorWebsite(e.target.value)}
                    placeholder="https://mymemecoin.com"
                  />
                </div>
              )}
              <div className="authority-grid">
                <AuthorityCard
                  title="Revoke Freeze"
                  description="Prevents the freeze authority from freezing token accounts."
                  checked={form.revokeFreezeAuthority}
                  onClick={() =>
                    update("revokeFreezeAuthority", !form.revokeFreezeAuthority)
                  }
                />
                <AuthorityCard
                  title="Revoke Mint"
                  description="Locks the supply by preventing any additional token minting."
                  checked={form.revokeMintAuthority}
                  onClick={() =>
                    update("revokeMintAuthority", !form.revokeMintAuthority)
                  }
                />
                <AuthorityCard
                  title="Revoke Update"
                  description="Makes the token metadata immutable after creation."
                  checked={Boolean(form.revokeUpdateAuthority)}
                  onClick={() =>
                    update("revokeUpdateAuthority", !form.revokeUpdateAuthority)
                  }
                />
              </div>
            </div>
          )}

          <div className="fee-summary" aria-live="polite">
            <div><span>Launch fee</span><strong>0.2 SOL</strong></div>
            {form.revokeFreezeAuthority && <div><span>Revoke Freeze</span><strong>0.1 SOL</strong></div>}
            {form.revokeMintAuthority && <div><span>Revoke Mint</span><strong>0.1 SOL</strong></div>}
            {form.revokeUpdateAuthority && <div><span>Revoke Update</span><strong>0.1 SOL</strong></div>}
            <div className="fee-total"><span>Platform total</span><strong>{platformFeeSol(form)} SOL</strong></div>
            <p>Solana network fees and account rent are additional. The platform fee and token creation are approved together in your wallet.</p>
            <details><summary>Receiving wallet</summary><code>{PLATFORM_RECEIVING_WALLET}</code></details>
          </div>
          <div className="wizard-actions">
            {step > 1 && (
              <button
                className="secondary-action"
                disabled={loading}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
              >
                <ArrowLeft size={17} /> Previous
              </button>
            )}
            {step === 1 && <div />}
            {step < 3 ? (
              <button
                className="primary-action"
                disabled={!canNext}
                onClick={() => setStep((s) => Math.min(3, s + 1))}
              >
                Next <ArrowRight size={17} />
              </button>
            ) : (
              <button
                className="primary-action launch-button"
                disabled={loading}
                onClick={() => connected ? void launch() : setWalletVisible(true)}
              >
                {loading ? "Creating Token..." : connected ? `Create Token · ${platformFeeSol(form)} SOL` : "Connect Wallet to Create"}{" "}
                {!loading && <Rocket size={17} />}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-card">
          <h2>How to use Solana Token Creator</h2>
          <p>Follow these simple steps:</p>
          <ol>
            {[
              "Connect your Solana wallet.",
              "Write the name you want for your Token.",
              "Indicate the symbol (max 8 characters).",
              "Upload the image for your token (PNG).",
              "Select the decimals quantity (0 for Whitelist Token, 5 for utility token, 9 for meme coins).",
              "Write the description you want for your SPL Token.",
              "Put the supply of your Token.",
              "Click on Create, accept the transaction, and wait until your token is ready.",
            ].map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      </section>
      <section className="faq-section" id="faq">
        <div className="faq-card">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-list">
            {[
              [
                "What is Launch Meme?",
                "Create Solana tokens from a form using your own wallet. Choose a name, symbol, image, supply and token authorities.",
              ],
              [
                "How do I create a token?",
                "Connect a supported wallet, complete the three steps, then approve the creation transaction in your wallet.",
              ],
              [
                "Are there any fees?",
                "The launch fee is 0.2 SOL, plus 0.1 SOL each for Revoke Mint, Revoke Freeze and Revoke Update. Network fees and account rent are additional. Your wallet approves the platform fee and token creation together.",
              ],
              [
                "How does liquidity management work on our platform?",
                "Select Raydium or Meteora to view wallet tokens. Create a token/SOL pool from your wallet, then add or remove liquidity from supported Raydium CPMM and Meteora DAMM V2 positions. Both assets and network fees are required.",
              ],
              [
                "What is Solana, and why should I launch my token on it?",
                "Solana is a public blockchain with an ecosystem of wallets, tokens and decentralised exchanges.",
              ],
              [
                "How can I create a token on the Solana blockchain?",
                "Complete the creator form and sign the transaction. The supply is minted to your connected wallet.",
              ],
              [
                "What are the steps to deploy my own token on Solana?",
                "Choose your token details, supply, description and optional social links. Review authorities and approve creation.",
              ],
              [
                "How much does it cost to create a Solana token?",
                "The platform fee ranges from 0.2 SOL to 0.5 SOL depending on the three optional authority revocations. Network fees and account rent are additional.",
              ],
              [
                "What's the difference between SPL tokens and other token standards?",
                "SPL is Solana's token standard. Other blockchains have their own token programs and standards.",
              ],
              [
                "Can I edit my token after creation?",
                "Metadata can be changed only while you retain its update authority. Making metadata immutable is permanent.",
              ],
              [
                "Where can my token be traded after creation?",
                "Creation alone does not create a market. You must add liquidity to an exchange separately.",
              ],
              [
                "Is it safe to create tokens using this platform?",
                "The wallet signs transactions. Review instructions and amounts before approving, and keep your recovery phrase private.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function SocialInput({
  icon,
  label,
  value,
  placeholder,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="social-input">
      <span>
        {icon}
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function AuthorityCard({
  title,
  description,
  checked,
  onClick,
}: {
  title: string;
  description: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className={"authority-card " + (checked ? "selected" : "")}
      onClick={onClick}
    >
      <div>
        <strong>{title}</strong>
        <span className="authority-price">+0.1 SOL</span>
        <p>{description}</p>
        <span className="authority-select">
          {checked ? "Selected" : "Select"}
        </span>
      </div>
    </button>
  );
}
