import Link from "next/link";
export default function Learn() {
  return (
    <section className="learn-page">
      <h1>How to create your Solana Token</h1>
      <p>A guide to creating a token with your connected wallet.</p>
      <div className="status-note">
        Before you start: connect a supported wallet and keep enough SOL for
        network fees and account rent.
      </div>
      {[
        [
          "Step 1 — Basic token info",
          [
            ["Token Name", "Give your token a name of up to 32 UTF-8 bytes."],
            ["Token Symbol", "Choose a ticker of up to eight characters."],
            [
              "Token Image",
              "Select a PNG or JPG under 4MB. Check the preview, then choose Next.",
            ],
          ],
        ],
        [
          "Step 2 — Decimals, supply & description",
          [
            [
              "Decimals",
              "Choose the token precision. Nine is common for meme coins.",
            ],
            [
              "Total Supply",
              "Choose a positive whole-number supply within the token program's limits.",
            ],
            [
              "Description",
              "Explain your project. Use Previous to edit the first step.",
            ],
          ],
        ],
        [
          "Step 3 — Links & token authorities",
          [
            ["Social links", "Add links to your website and community."],
            ["Creator information", "Optionally add your creator details."],
            ["Revoke Freeze", "Remove the ability to freeze holder accounts."],
            ["Revoke Mint", "Remove the ability to create more supply."],
            [
              "Revoke Update",
              "Make metadata immutable. Revocation is permanent.",
            ],
            [
              "Create Token",
              "The image and metadata are uploaded before your wallet is asked to sign. Review the transaction, approve it, and wait for confirmation.",
            ],
          ],
        ],
      ].map(([title, items]) => (
        <div className="learn-card" key={title as string}>
          <h2>{title as string}</h2>
          {(items as string[][]).map(([heading, text]) => (
            <div key={heading}>
              <h3>{heading}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      ))}
      <Link href="/" className="primary-action" style={{ marginTop: 24 }}>
        Create my token now
      </Link>
    </section>
  );
}
