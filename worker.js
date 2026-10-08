// MuzjetAI — Cloudflare Workers entry (static assets + /api routes).
// Used when the site is deployed as a Worker (…workers.dev). The same API code in /functions
// also works unchanged on Cloudflare Pages.
import { onRequest as aiWriter } from './functions/api/ai-writer.js';
import { onRequest as gemini } from './functions/api/gemini.js';
import { onRequest as media } from './functions/api/media.js';
import { onRequest as mediaStatus } from './functions/api/media-status.js';
import { onRequest as youtube } from './functions/api/youtube/[[path]].js';

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path.startsWith('/api/')) {
      try {
        const ctx = { request, env, params: {} };
        if (path === '/api/ai-writer') return await aiWriter(ctx);
        if (path === '/api/gemini') return await gemini(ctx);
        if (path === '/api/media') return await media(ctx);
        if (path === '/api/media-status') return await mediaStatus(ctx);
        if (path === '/api/youtube' || path.startsWith('/api/youtube/')) {
          const rest = path.slice('/api/youtube'.length).replace(/^\/+/, '');
          return await youtube({ ...ctx, params: { path: rest ? rest.split('/') : [] } });
        }
        return jsonResponse(404, { error: { message: 'Unknown API route.' } });
      } catch (e) {
        return jsonResponse(500, { error: { message: 'Server error: ' + (e && e.message || 'unknown') } });
      }
    }
    return env.ASSETS.fetch(request);
  }
};
