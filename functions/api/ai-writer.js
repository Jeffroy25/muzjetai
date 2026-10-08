// MuzjetAI AI Writer — multi-provider fallback router.
// Providers are tried in order. 429/quota/capacity/auth/model errors move to the next configured provider.
const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  body: JSON.stringify(body)
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

function prompt(body) {
  return String(body.user || body.prompt || '').trim();
}

async function gemini(body, env) {
  const key = String(env.GEMINI_API_KEY || '').trim();
  if (!key) throw Object.assign(new Error('Gemini is not configured'), { code: 'NOT_CONFIGURED' });
  const model = String(env.GEMINI_MODEL || '').trim() || 'gemini-3.5-flash';
  const payload = {
    system_instruction: { parts: [{ text: String(body.system || 'You are MuzjetAI AI Writer. Write clear, original, publication-ready content. Follow the requested format exactly.') }] },
    contents: [{ role: 'user', parts: [{ text: prompt(body) }] }],
    generationConfig: { maxOutputTokens: Math.max(256, Math.min(Number(body.maxTokens) || 8192, 32768)) }
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Gemini error (${r.status})`), { status: r.status });
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  return parts.filter(p => typeof p.text === 'string').map(p => p.text).join('').trim();
}

async function openaiCompatible({ key, base, model, body, provider }) {
  key = String(key || '').trim();
  if (!key) throw Object.assign(new Error(`${provider} is not configured`), { code: 'NOT_CONFIGURED' });
  const payload = {
    model,
    messages: [
      { role: 'system', content: String(body.system || 'You are MuzjetAI AI Writer. Write clear, original, publication-ready content. Follow the requested format exactly.') },
      { role: 'user', content: prompt(body) }
    ],
    max_tokens: Math.max(256, Math.min(Number(body.maxTokens) || 8192, 32768))
  };
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(payload)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `${provider} error (${r.status})`), { status: r.status });
  return j?.choices?.[0]?.message?.content?.trim() || '';
}

const makeProviders = env => [
  { name: 'Gemini', fn: body => gemini(body, env) },
  { name: 'Groq', fn: body => openaiCompatible({ key: env.GROQ_API_KEY, base: 'https://api.groq.com/openai/v1', model: env.GROQ_MODEL || 'openai/gpt-oss-120b', body, provider: 'Groq' }) },
  { name: 'OpenRouter', fn: body => openaiCompatible({ key: env.OPENROUTER_API_KEY, base: 'https://openrouter.ai/api/v1', model: env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free', body, provider: 'OpenRouter' }) }
];

function shouldFallback(err) {
  if (err?.code === 'NOT_CONFIGURED') return true;
  if (err?.status == null) return true;
  return [400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504].includes(Number(err.status));
}

async function handler(event, env) {
  if (event.httpMethod !== 'POST') return json(405, { error: { message: 'Method not allowed' } }, { Allow: 'POST' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: { message: 'Invalid JSON request.' } }); }
  if (!prompt(body)) return json(400, { error: { message: 'A writing prompt is required.' } });

  env = env || {};
  const providers = makeProviders(env);
  const attempted = [];
  const errors = [];
  for (const provider of providers) {
    attempted.push(provider.name);
    try {
      // One short retry for transient 429/5xx before moving on.
      let last;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const text = await provider.fn(body);
          if (text) return json(200, { text, provider: provider.name, attempted });
          throw Object.assign(new Error(`${provider.name} returned empty content`), { status: 502 });
        } catch (e) {
          last = e;
          if (attempt === 0 && [408, 429, 500, 502, 503, 504].includes(Number(e?.status))) {
            await sleep(Number(e?.retryAfterMs) || 700);
            continue;
          }
          break;
        }
      }
      if (!shouldFallback(last)) throw last;
      errors.push(`${provider.name}: ${last?.message || 'failed'}`);
    } catch (e) {
      errors.push(`${provider.name}: ${e?.message || 'failed'}`);
    }
  }

  return json(503, {
    error: {
      message: 'All configured AI Writer providers are unavailable. Add provider API keys in Cloudflare Pages, then try again.',
      attempted,
      details: errors
    }
  });
};

export { handler };

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const event = {
    httpMethod: context.request.method,
    body: await (context.request.method === 'GET' || context.request.method === 'HEAD' ? Promise.resolve(null) : context.request.text()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    path: url.pathname,
    rawUrl: url.toString(),
    pathParameters: {}
  };
  const result = await handler(event, context.env);
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}
