# MuzjetAI — Cloudflare Pages deployment

This version is prepared for Cloudflare Pages + Pages Functions.

## 1. Deploy with GitHub
Push this project to GitHub, then in Cloudflare:
Workers & Pages → Create application → Pages → Connect to Git.

Use:
- Build command: leave empty
- Build output directory: `.`
- Root directory: `/`

Cloudflare Pages Functions are in `/functions` and map directly to their URL paths.

## 2. Add API keys
Cloudflare dashboard:
Workers & Pages → your Pages project → Settings → Variables and Secrets → Add.

For sensitive API keys, choose **Encrypt**.

AI Writer:
- GEMINI_API_KEY
- GEMINI_MODEL (optional; recommended current model)
- GROQ_API_KEY
- GROQ_MODEL (optional)
- OPENROUTER_API_KEY
- OPENROUTER_MODEL (optional)

Other existing MuzjetAI services:
- YOUTUBE_DATA_API_KEY
- PIXABAY_API_KEY
- PEXELS_API_KEY
- UNSPLASH_ACCESS_KEY
- SMITHSONIAN_API_KEY
- FLICKR_API_KEY
- MEDIA_PROVIDER_ORDER (optional)

Set secrets for Production, and Preview too if you want them available in preview deployments.

## 3. AI Writer fallback
The order is:
Gemini → Groq → OpenRouter.

If a provider is missing, rate-limited, unavailable, or returns a supported error, the next configured provider is attempted automatically.

Keys are never placed in public HTML/JavaScript. Pages Functions access them through `context.env`.

## 4. API routes
- POST `/api/ai-writer`
- POST `/api/gemini` (backward compatibility)
- GET `/api/media`
- GET `/api/media-status`
- GET `/api/youtube/...`

Do not commit `.env` files or API keys to GitHub.
