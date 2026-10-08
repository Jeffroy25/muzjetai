# MuzjetAI — GitHub + Cloudflare Pages

This package is prepared for Cloudflare Pages **Git integration**. The website files and the `functions/` directory are at the repository root.

## Deploy

1. Create a new GitHub repository, e.g. `muzjetai`.
2. Upload **the contents of this folder** to the repository root (do not upload the parent folder itself).
3. In Cloudflare Dashboard go to **Workers & Pages → Create application → Pages → Connect to Git**.
4. Select the GitHub repository and production branch `main`.
5. This project is a static site with Pages Functions, so leave the **Build command empty** and use the repository root as the output/static directory as appropriate for the Pages UI.
6. Deploy.

## Secrets

In Cloudflare Pages → Settings → Variables and Secrets, add these as encrypted secrets for Production (and Preview if desired):

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`

Optional model variables:

- `GEMINI_MODEL`
- `GROQ_MODEL`
- `OPENROUTER_MODEL`

Never put real API keys in frontend files or commit them to GitHub.

## API routes

The root `functions/` folder provides:

- `/api/ai-writer`
- `/api/gemini`
- `/api/media`
- `/api/media-status`
- `/api/youtube/*`

## Important

Do **not** use Cloudflare Pages Direct Upload for this package if you need the API Functions. Use GitHub/Git integration (or Wrangler). Cloudflare's dashboard Direct Upload does not deploy a `functions/` directory.

## Video workflow

AI Video Studio can hand the project to Video Maker. Video Maker is the final editor/export stage and produces an MP4 download. JSON is optional project backup/import data, not the final video.

## Troubleshooting

- **Keys added but still errors:** Cloudflare only applies new variables to a NEW deployment. Deployments > latest > Retry deployment (or push any commit).
- **Check the keys loaded:** open `https://YOUR-SITE.pages.dev/api/media-status` and look at `keysLoaded`. Every key you added should show `true` (the keys themselves are never shown).
- Production keys apply to the production URL only; add them under Preview too if you test on preview URLs.
- Paste the key only: no quotes, no spaces, no `KEY=` prefix.
- Name must match exactly, e.g. `GEMINI_API_KEY`.

## Workers (…workers.dev) vs Pages (…pages.dev)

This package now works on BOTH.
- **Workers + Git (your muzjetai….workers.dev URL):** `worker.js`, `wrangler.jsonc` and `.assetsignore` serve the site and the `/api/*` routes. Leave the build command empty and the deploy command as `npx wrangler deploy`. The Worker name in `wrangler.jsonc` ("muzjetai") must match your Worker's name in Cloudflare.
- **Pages + Git (…pages.dev):** the `functions/` folder is used automatically.
Add the API keys under Settings > Variables and Secrets of whichever one you use.
