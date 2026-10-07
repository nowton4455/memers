import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import WalletProvider from "@/contexts/WalletProvider";
import PendingTransactions from "@/components/PendingTransactions";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Memers — Create Solana Tokens Fast",
    template: "%s | Memers",
  },
  description:
    "Create a Solana token from a simple no-code interface. Configure metadata, supply and token authorities from your own wallet.",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-background" aria-hidden="true" />
        <WalletProvider>
          <Navbar />
          <PendingTransactions />
          <main className="site-main">{children}</main>
          <footer className="site-footer">
            <div className="footer-inner">
              <p className="footer-disclaimer">
                Memers is a non-custodial software interface that allows users
                to interact with public smart contracts on the Solana
                blockchain. We do not custody funds, execute transactions,
                provide financial advice, or guarantee outcomes. All actions are
                performed on-chain and approved by the user's wallet. Use at
                your own risk. See <a href="/terms-of-use">Terms of Use</a> and{" "}
                <a href="/privacy-policy">Privacy Policy</a> for details.
              </p>
              <div className="footer-bottom">
                <span>
                  © {new Date().getFullYear()} Memers | All Rights Reserved
                </span>
                <div className="footer-links">
                  <a href="/learn">Learn</a>
                  <span>|</span>
                  <a href="/terms-of-use">Terms of Use</a>
                  <span>|</span>
                  <a href="/privacy-policy">Privacy Policy</a>
                </div>
              </div>
            </div>
          </footer>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#15151d",
                color: "#fff",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: "10px",
                fontSize: "13px",
              },
            }}
          />
        </WalletProvider>
      </body>
    </html>
  );
}
