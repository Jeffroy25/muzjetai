async function handler(event, env) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'Allow': 'GET', 'content-type': 'application/json' }, body: JSON.stringify({ error: { message: 'Method not allowed' } }) };
  }

  const key = env.YOUTUBE_DATA_API_KEY;
  const json = (statusCode, body) => ({
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body)
  });
  if (!key) return json(500, { error: { message: 'YouTube API is not configured on this site.' } });

  try {
    // Netlify may expose the splat as a string or an array depending on the
    // redirect/runtime. Normalize it so /api/youtube/channels always works.
    let path = (event.pathParameters && event.pathParameters.splat) || '';
    if (Array.isArray(path)) path = path.join('/');
    path = String(path).replace(/^\/+|\/+$/g, '');

    // Netlify does not always populate pathParameters for wildcard redirects.
    // Fall back to the actual request path so /api/youtube/resolve cannot be
    // accidentally treated as /api/youtube/channels.
    if (!path) {
      const requestPath = String(event.path || '');
      const rawUrl = String(event.rawUrl || '');
      const candidates = [requestPath, rawUrl ? (() => { try { return new URL(rawUrl).pathname; } catch (_) { return ''; } })() : ''];
      for (const candidate of candidates) {
        const m = candidate.match(/\/api\/youtube\/(.+)$/) || candidate.match(/\/\.netlify\/functions\/youtube\/(.+)$/);
        if (m && m[1]) { path = m[1].split('/')[0]; break; }
      }
    }
    path = path || 'channels';
    if (!['channels','search','playlistItems','videos','resolve'].includes(path)) path = 'channels';

    const input = event.queryStringParameters || {};
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) if (v != null && String(v) !== '') params.set(k, String(v));

    // Resolve a complete YouTube channel URL server-side. This is the primary
    // channel lookup path and avoids relying on browser-side query construction.
    if (path === 'resolve') {
      const raw = String(params.get('url') || params.get('channel') || '').trim();
      if (!raw) return json(400, { error: { message: 'A YouTube channel URL is required.' } });
      let u;
      try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); }
      catch (_) { return json(400, { error: { message: 'Invalid YouTube channel URL.' } }); }
      const host = u.hostname.replace(/^www\.|^m\./i, '').toLowerCase();
      if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) {
        return json(400, { error: { message: 'Please provide a YouTube channel URL.' } });
      }
      const parts = u.pathname.split('/').filter(Boolean);
      let filterName = '', filterValue = '';
      if (parts[0] && parts[0][0] === '@') { filterName = 'forHandle'; filterValue = parts[0]; }
      else if (parts[0] === 'channel' && parts[1]) { filterName = 'id'; filterValue = parts[1]; }
      else if (parts[0] === 'user' && parts[1]) { filterName = 'forUsername'; filterValue = parts[1]; }
      else if (parts[0] === 'c' && parts[1]) {
        const sp = new URLSearchParams({ part:'snippet', type:'channel', q:parts[1], maxResults:'1', key });
        const sr = await fetch('https://www.googleapis.com/youtube/v3/search?' + sp.toString());
        const sj = await sr.json().catch(() => ({}));
        if (!sr.ok) return { statusCode: sr.status, headers: {'content-type':'application/json; charset=utf-8'}, body: JSON.stringify(sj) };
        const found = sj.items && sj.items[0] && sj.items[0].snippet && sj.items[0].snippet.channelId;
        if (!found) return json(404, { error: { message: 'No YouTube channel was found for that link.' } });
        filterName = 'id'; filterValue = found;
      } else {
        return json(400, { error: { message: 'Please provide a YouTube channel URL such as https://www.youtube.com/@channelname.' } });
      }
      const cp = new URLSearchParams({ part:'snippet,contentDetails', [filterName]:filterValue, key });
      const cr = await fetch('https://www.googleapis.com/youtube/v3/channels?' + cp.toString());
      const ct = await cr.text();
      return { statusCode: cr.status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}, body: ct };
    }

    // Resolve a legacy /c/ name here only if a caller still sends channelSearch.
    // The normal frontend resolves /c/ via search.list before calling channels.list.
    if (path === 'channels' && params.has('channelSearch') && !params.has('id') && !params.has('forHandle') && !params.has('forUsername')) {
      const q = params.get('channelSearch').trim();
      if (!q) return json(400, { error: { message: 'A YouTube channel is required.' } });
      const sp = new URLSearchParams({ part:'snippet', type:'channel', q, maxResults:'1', key });
      const sr = await fetch('https://www.googleapis.com/youtube/v3/search?' + sp.toString());
      const sj = await sr.json().catch(() => ({}));
      const id = sj.items && sj.items[0] && sj.items[0].snippet && sj.items[0].snippet.channelId;
      if (!sr.ok || !id) return json(sr.status || 404, { error: { message: 'No YouTube channel was found for that link.' } });
      params.set('id', id);
      params.delete('channelSearch');
    }

    if (path === 'channels') {
      const filters = ['mySubscribers','managedByMe','categoryId','id','forHandle','forUsername','mine'].filter(name => {
        const value = params.get(name);
        return value !== null && value !== '';
      });
      if (filters.length !== 1) {
        return json(400, { error: { message: 'A YouTube channel is required. Provide exactly one channel filter: id, forHandle, or forUsername.' } });
      }
    }

    params.delete('channel');
    params.delete('channelSearch');
    params.set('key', key);
    const url = 'https://www.googleapis.com/youtube/v3/' + encodeURIComponent(path) + '?' + params.toString();
    const r = await fetch(url);
    const text = await r.text();
    return { statusCode: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: text };
  } catch (e) {
    return json(502, { error: { message: 'Could not reach YouTube.' } });
  }
};

export { handler };

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const wildcard = context.params?.path;
  const splat = Array.isArray(wildcard) ? wildcard.join('/') : String(wildcard || '');
  const event = {
    httpMethod: context.request.method,
    body: null,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    path: url.pathname,
    rawUrl: url.toString(),
    pathParameters: { splat }
  };
  const result = await handler(event, context.env);
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}
