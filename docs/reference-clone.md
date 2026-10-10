# Launch Meme reference clone

Workflow: JCodesMore/ai-website-cloner-template, MIT. Its canonical clone-website skill is included under `.agents/skills/clone-website`; license is in `docs/website-cloner-LICENSE`.

The template is a scaffold/workflow, not the reference website source. This project keeps its existing Next.js app and Solana implementations, applying the template workflow to the public reference.

Source: https://www.memescoinlaunch.fun/
Destination: https://lanchmeme.fun/

## Route ownership
- `/`: `src/app/page.tsx`, `src/components/ImageUpload.tsx`
- Shared navigation: `src/components/Navbar.tsx`
- Shared colors, spacing and responsive layout: `src/app/globals.css`
- Branding and metadata: `public/launch-meme-logo.png`, `src/app/layout.tsx`
- Existing `/liquidity`, `/trending`, `/x-feed`, `/learn`, `/terms-of-use`, `/privacy-policy` remain local destinations.

## Observations
Desktop reference: system sans, #18181b canvas, #1d1d20 cards, #333336 borders, violet actions, cyan-to-violet top strip. Header 64px plus 24px banner; hero 48px/72px; wizard circles 40px; creator width 672px with 24px padding. Instructions and FAQ outer cards 688px; FAQ items have rounded borders and 12px gaps. Name and symbol are two columns; upload uses a dashed border and centered icon. FAQ buttons expand their answers. Header remains sticky during scrolling.

## Intentional differences
Launch Meme branding uses the user-supplied source logo from https://www.memescoinlaunch.fun/assets/logo-v2-Bf1X1Bzk.png. The banner describes wallet access instead of advertising an unconfigured platform price/countdown. Image limit is 4MB to fit Vercel function requests. Existing metadata, transaction confirmation and Blob storage are retained. No receiving wallet or platform fee has been supplied. Exact mobile source comparison and funded mainnet transactions remain unverified.
