function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body)
  };
}
async function handler(event, env) {
  env = env || {};
  const has = name => Boolean(String(env[name] || '').trim());
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const order = (String(env.MEDIA_PROVIDER_ORDER || 'pixabay,pexels,openverse,wikimedia,unsplash,nasa,archive,loc,smithsonian,flickr'))
    .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return json(200, {
    providers: {
      pixabay: { configured: has('PIXABAY_API_KEY'), media: ['image','video'] },
      pexels: { configured: has('PEXELS_API_KEY'), media: ['image','video'] },
      unsplash: { configured: has('UNSPLASH_ACCESS_KEY'), media: ['image'] },
      openverse: { configured: true, media: ['image'] },
      wikimedia: { configured: true, media: ['image','video'] },
      nasa: { configured: true, media: ['image','video'] },
      archive: { configured: true, media: ['image','video'] },
      loc: { configured: true, media: ['image'] },
      smithsonian: { configured: has('SMITHSONIAN_API_KEY'), media: ['image'] },
      flickr: { configured: has('FLICKR_API_KEY'), media: ['image'] }
    },
    order,
    keysLoaded: {
      GEMINI_API_KEY: has('GEMINI_API_KEY'), GROQ_API_KEY: has('GROQ_API_KEY'), OPENROUTER_API_KEY: has('OPENROUTER_API_KEY'),
      YOUTUBE_DATA_API_KEY: has('YOUTUBE_DATA_API_KEY'), PIXABAY_API_KEY: has('PIXABAY_API_KEY'), PEXELS_API_KEY: has('PEXELS_API_KEY'), UNSPLASH_ACCESS_KEY: has('UNSPLASH_ACCESS_KEY')
    },
    generatedAt: new Date().toISOString()
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
