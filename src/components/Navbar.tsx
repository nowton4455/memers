"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Coins, Droplets, TrendingUp, Menu, ChevronDown } from "lucide-react";
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);
export default function Navbar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(false);
  return (
    <>
      <div className="promo-bar">
        CREATE COIN: 0.2 SOL • OPTIONAL AUTHORITY REVOCATIONS: 0.1 SOL EACH
      </div>
      <nav className="launch-nav" aria-label="Main navigation">
        <div className="nav-inner">
          <Link href="/" className="brand">
            <img src="/launch-meme-logo.png" width={28} height={28} alt="" className="brand-mark" />
            <span>Launch Meme</span>
          </Link>
          <button
            className="mobile-toggle"
            aria-label="Toggle navigation"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <Menu size={22} />
          </button>
          <div className={"nav-links " + (open ? "open" : "")}>
            <Link
              onClick={() => setOpen(false)}
              href="/"
              className={path === "/" ? "active" : ""}
            >
              <Coins size={16} />
              Create Coin
            </Link>
            <Link
              onClick={() => setOpen(false)}
              href="/liquidity"
              className={path.startsWith("/liquidity") ? "active" : ""}
            >
              <Droplets size={16} />
              Manage Liquidity
            </Link>
            <Link
              onClick={() => setOpen(false)}
              href="/trending"
              className={"nav-badged " + (path === "/trending" ? "active" : "")}
            >
              <TrendingUp size={16} />
              Copy Trending Coins <b>NEW</b>
            </Link>
            <Link
              onClick={() => setOpen(false)}
              href="/x-feed"
              className={"nav-badged " + (path === "/x-feed" ? "active" : "")}
            >
              <span>𝕏</span>Tracker <b className="live">LIVE</b>
            </Link>
          </div>
          <div className="nav-actions">
            <div className="language">
              <button
                aria-label="Change language"
                aria-expanded={language}
                onClick={() => setLanguage(!language)}
              >
                🇺🇸 EN <ChevronDown size={14} style={{ display: "inline" }} />
              </button>
              {language && (
                <div className="language-menu">
                  <button onClick={() => setLanguage(false)}>
                    🇺🇸 English ✓
                  </button>
                </div>
              )}
            </div>
            <WalletMultiButton />
          </div>
        </div>
      </nav>
    </>
  );
}
