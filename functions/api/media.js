/* MuzjetAI Media Fallback Engine
 * Providers are attempted in priority order. Providers without keys are skipped.
 * Free/no-key fallbacks: Openverse + Wikimedia Commons.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=300'
};

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { ...JSON_HEADERS, ...extraHeaders },
  body: JSON.stringify(body)
});

const clean = (v) => String(v || '').trim();
const safeUrl = (v) => {
  try { return new URL(v).toString(); } catch { return ''; }
};

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    const text = await r.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok) {
      const err = new Error(data?.error?.message || data?.message || `Provider returned ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function imageItem({ title, thumbnail, url, source, sourceUrl, author, authorUrl, license, downloadUrl }) {
  return {
    type: 'image',
    title: clean(title) || `${source} image`,
    thumbnail: safeUrl(thumbnail) || safeUrl(url),
    url: safeUrl(url),
    source,
    sourceUrl: safeUrl(sourceUrl),
    author: clean(author),
    authorUrl: safeUrl(authorUrl),
    license: clean(license),
    downloadUrl: safeUrl(downloadUrl)
  };
}

function videoItem({ title, thumbnail, url, source, sourceUrl }) {
  return {
    type: 'video',
    title: clean(title) || `${source} video`,
    thumbnail: safeUrl(thumbnail),
    url: safeUrl(url),
    source,
    sourceUrl: safeUrl(sourceUrl)
  };
}

async function pixabay(q, env) {
  const key = clean(env.PIXABAY_API_KEY);
  if (!key) throw new Error('PIXABAY_API_KEY is not configured');
  const base = 'https://pixabay.com/api/';
  const p = await fetchJson(base + '?' + new URLSearchParams({
    key, q, image_type: 'photo', orientation: 'horizontal', per_page: '8', safesearch: 'true'
  }));
  const images = (p.hits || []).map(x => imageItem({
    title: x.tags || 'Pixabay image', thumbnail: x.webformatURL, url: x.largeImageURL || x.webformatURL,
    source: 'Pixabay', sourceUrl: x.pageURL
  })).filter(x => x.url && x.thumbnail);

  const v = await fetchJson('https://pixabay.com/api/videos/?' + new URLSearchParams({
    key, q, per_page: '8', safesearch: 'true'
  }));
  const videos = (v.hits || []).map(x => {
    const files = x.videos || {};
    const f = files.medium || files.small || files.large || files.tiny;
    return videoItem({ title: x.tags || 'Pixabay video', thumbnail: x.userImageURL, url: f?.url, source: 'Pixabay', sourceUrl: x.pageURL });
  }).filter(x => x.url);
  return { images, videos };
}

async function pexels(q, env) {
  const key = clean(env.PEXELS_API_KEY);
  if (!key) throw new Error('PEXELS_API_KEY is not configured');
  const headers = { Authorization: key };
  const p = await fetchJson('https://api.pexels.com/v1/search?' + new URLSearchParams({ query: q, per_page: '8', orientation: 'landscape' }), { headers });
  const images = (p.photos || []).map(x => imageItem({
    title: x.alt || 'Pexels image', thumbnail: x.src?.medium || x.src?.small, url: x.src?.large2x || x.src?.large || x.src?.original,
    source: 'Pexels', sourceUrl: x.url, author: x.photographer, authorUrl: x.photographer_url
  })).filter(x => x.url && x.thumbnail);

  const v = await fetchJson('https://api.pexels.com/videos/search?' + new URLSearchParams({ query: q, per_page: '8', orientation: 'landscape' }), { headers });
  const videos = (v.videos || []).map(x => {
    const files = (x.video_files || []).filter(a => a.file_type === 'video/mp4').sort((a,b) => (b.width || 0) - (a.width || 0));
    return videoItem({ title: 'Pexels video', thumbnail: x.image, url: files[0]?.link, source: 'Pexels', sourceUrl: x.url });
  }).filter(x => x.url);
  return { images, videos };
}

async function unsplash(q, env) {
  const key = clean(env.UNSPLASH_ACCESS_KEY);
  if (!key) throw new Error('UNSPLASH_ACCESS_KEY is not configured');
  const p = await fetchJson('https://api.unsplash.com/search/photos?' + new URLSearchParams({ query: q, per_page: '8', orientation: 'landscape', content_filter: 'high' }), {
    headers: { Authorization: `Client-ID ${key}` }
  });
  const images = (p.results || []).map(x => imageItem({
    title: x.alt_description || x.description || 'Unsplash photo',
    thumbnail: x.urls?.small || x.urls?.regular, url: x.urls?.regular || x.urls?.full,
    source: 'Unsplash', sourceUrl: x.links?.html,
    author: x.user?.name, authorUrl: x.user?.links?.html,
    downloadUrl: x.links?.download_location
  })).filter(x => x.url && x.thumbnail);
  return { images, videos: [] };
}

async function openverse(q) {
  const p = await fetchJson('https://api.openverse.org/v1/images/?' + new URLSearchParams({ q, page_size: '8', mature: 'false' }));
  const images = (p.results || []).map(x => imageItem({
    title: x.title || 'Openverse image', thumbnail: x.thumbnail || x.url, url: x.url,
    source: 'Openverse', sourceUrl: x.foreign_landing_url || x.source || '', author: x.creator,
    authorUrl: x.creator_url, license: x.license
  })).filter(x => x.url && x.thumbnail);
  return { images, videos: [] };
}

async function wikimedia(q) {
  const p = await fetchJson('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '10',
    prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '800', format: 'json', origin: '*'
  }));
  const pages = Object.values(p.query?.pages || {});
  const images = [], videos = [];
  for (const x of pages) {
    const info = x.imageinfo?.[0];
    if (!info?.url) continue;
    const item = { title: x.title?.replace(/^File:/, '') || 'Wikimedia Commons media', thumbnail: info.thumburl || info.url, url: info.url, source: 'Wikimedia Commons', sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(x.title || '')}` };
    if (String(info.mime || '').startsWith('video/')) videos.push(videoItem(item));
    else images.push(imageItem(item));
  }
  return { images: images.filter(x => x.url && x.thumbnail), videos: videos.filter(x => x.url) };
}


/* ---------- Extra reuse-friendly sources (no social media / news scraping) ---------- */
async function nasa(q) {
  const p = await fetchJson('https://images-api.nasa.gov/search?' + new URLSearchParams({ q, media_type: 'image,video', page_size: '10' }));
  const items = p.collection?.items || [];
  const images = [], videos = [];
  const vids = [];
  for (const it of items) {
    const d = it.data?.[0]; if (!d) continue;
    const thumb = it.links?.find(l => l.rel === 'preview')?.href || it.links?.[0]?.href;
    const base = { title: d.title, thumbnail: thumb, source: 'NASA', sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`, author: d.photographer || d.secondary_creator || 'NASA', license: 'NASA media usage guidelines (generally public domain)' };
    if (d.media_type === 'image' && thumb) {
      images.push(imageItem({ ...base, url: thumb.replace(/~thumb(\.\w+)$/, '~medium$1') }));
    } else if (d.media_type === 'video' && it.href && vids.length < 2) {
      vids.push({ it, base });
    }
  }
  await Promise.all(vids.map(async ({ it, base }) => {
    try {
      const list = await fetchJson(it.href, {}, 8000);
      const files = Array.isArray(list) ? list : [];
      const mp4 = files.find(u => /~medium\.mp4$/i.test(u)) || files.find(u => /~mobile\.mp4$/i.test(u)) || files.find(u => /\.mp4$/i.test(u));
      if (mp4) videos.push(videoItem({ ...base, url: mp4.replace(/^http:/, 'https:') }));
    } catch {}
  }));
  return { images: images.filter(x => x.url && x.thumbnail), videos };
}

async function archive(q) {
  const lucene = `(${q.replace(/["():]/g, ' ')}) AND mediatype:(movies OR image) AND collection:(prelinger OR nasa OR flickrcommons OR library_of_congress OR smithsonian)`;
  const p = await fetchJson('https://archive.org/advancedsearch.php?' + new URLSearchParams({ q: lucene, rows: '6', output: 'json' }) + '&fl[]=identifier&fl[]=title&fl[]=mediatype&fl[]=creator');
  const docs = (p.response?.docs || []).slice(0, 5);
  const images = [], videos = [];
  await Promise.all(docs.map(async d => {
    try {
      const m = await fetchJson('https://archive.org/metadata/' + encodeURIComponent(d.identifier), {}, 9000);
      const files = m.files || [];
      const link = name => 'https://archive.org/download/' + encodeURIComponent(d.identifier) + '/' + name.split('/').map(encodeURIComponent).join('/');
      const base = { title: Array.isArray(d.title) ? d.title[0] : d.title, thumbnail: 'https://archive.org/services/img/' + encodeURIComponent(d.identifier), source: 'Internet Archive', sourceUrl: 'https://archive.org/details/' + encodeURIComponent(d.identifier), author: Array.isArray(d.creator) ? d.creator[0] : d.creator, license: 'Public-domain / no-known-copyright collection (check source page)' };
      if (d.mediatype === 'movies') {
        const f = files.filter(x => /\.mp4$/i.test(x.name) && /h\.264|mpeg4/i.test(x.format || '')).sort((a, b) => (+a.size || 9e12) - (+b.size || 9e12))[0];
        if (f) videos.push(videoItem({ ...base, url: link(f.name) }));
      } else {
        const f = files.find(x => /jpeg|png/i.test(x.format || '') && !/thumb/i.test(x.name) && !/thumb/i.test(x.format || ''));
        if (f) images.push(imageItem({ ...base, url: link(f.name) }));
      }
    } catch {}
  }));
  return { images, videos };
}

async function loc(q) {
  const p = await fetchJson('https://www.loc.gov/photos/?' + new URLSearchParams({ q, fo: 'json', c: '10' }));
  const images = (p.results || []).map(x => {
    const arr = Array.isArray(x.image_url) ? x.image_url.filter(Boolean) : [];
    const url = arr[arr.length - 1];
    return imageItem({ title: x.title, thumbnail: arr[0] || url, url: url && url.startsWith('//') ? 'https:' + url : url, source: 'Library of Congress', sourceUrl: x.url || x.id, author: Array.isArray(x.contributor) ? x.contributor[0] : '', license: 'See rights statement on the Library of Congress page' });
  }).filter(x => x.url && x.thumbnail);
  return { images, videos: [] };
}

async function smithsonian(q, env) {
  const key = clean(env.SMITHSONIAN_API_KEY);
  if (!key) return { images: [], videos: [] };
  const p = await fetchJson('https://api.si.edu/openaccess/api/v1.0/search?' + new URLSearchParams({ q: `${q} AND online_media_type:"Images"`, rows: '8', api_key: key }));
  const images = [];
  for (const row of p.response?.rows || []) {
    const media = row.content?.descriptiveNonRepeating?.online_media?.media?.[0];
    if (!media?.content || String(media.usage?.access || '').toUpperCase() !== 'CC0') continue;
    images.push(imageItem({ title: row.title, thumbnail: media.thumbnail || media.content, url: media.content, source: 'Smithsonian Open Access', sourceUrl: row.content?.descriptiveNonRepeating?.record_link, author: row.content?.descriptiveNonRepeating?.data_source, license: 'CC0' }));
  }
  return { images, videos: [] };
}

async function flickr(q, env) {
  const key = clean(env.FLICKR_API_KEY);
  if (!key) return { images: [], videos: [] };
  const p = await fetchJson('https://www.flickr.com/services/rest/?' + new URLSearchParams({
    method: 'flickr.photos.search', api_key: key, text: q, license: '4,5,7,8,9,10', safe_search: '1', media: 'photos',
    sort: 'relevance', per_page: '10', extras: 'url_l,url_c,owner_name,license', format: 'json', nojsoncallback: '1'
  }));
  const names = { 4: 'CC BY', 5: 'CC BY-SA', 7: 'No known copyright', 8: 'US Government work', 9: 'CC0', 10: 'Public Domain Mark' };
  const images = (p.photos?.photo || []).map(x => imageItem({
    title: x.title, thumbnail: x.url_c || x.url_l, url: x.url_l || x.url_c, source: 'Flickr', sourceUrl: `https://www.flickr.com/photos/${x.owner}/${x.id}`,
    author: x.ownername, license: names[x.license] || 'Creative Commons'
  })).filter(x => x.url);
  return { images, videos: [] };
}

async function handler(event, env) {
  if (event.httpMethod !== 'GET') return json(405, { error: { message: 'Method not allowed' } });
  const params = event.queryStringParameters || {};
  const q = clean(params.q);
  const requestedType = clean(params.type).toLowerCase();
  if (!q) return json(400, { error: { message: 'Search query required' } });

  // Provider order can be changed with MEDIA_PROVIDER_ORDER, e.g. "pixabay,pexels,openverse,wikimedia,unsplash".
  const configuredOrder = clean(env.MEDIA_PROVIDER_ORDER).toLowerCase();
  const requestedSources = clean(params.sources).toLowerCase();
  const order = (requestedSources || configuredOrder || 'pixabay,pexels,openverse,wikimedia,unsplash,nasa,archive,loc,smithsonian,flickr').split(',').map(x => x.trim()).filter(Boolean);
  const providers = { pixabay, pexels, unsplash, openverse, wikimedia, nasa, archive, loc, smithsonian, flickr };
  const images = [], videos = [], attempted = [], errors = [];
  const seen = new Set();

  // We deliberately stop once we have enough results. This reduces API usage and respects provider rate limits.
  const enough = () => requestedType === 'video' ? videos.length >= 8 : requestedType === 'image' ? images.length >= 8 : (images.length + videos.length >= 12);

  for (const name of order) {
    const fn = providers[name];
    if (!fn || enough()) continue;
    attempted.push(name);
    try {
      const result = await fn(q, env);
      const add = (list, target) => {
        for (const item of list || []) {
          const key = item.url || item.thumbnail;
          if (!key || seen.has(key)) continue;
          if (requestedType && item.type !== requestedType) continue;
          seen.add(key); target.push(item);
        }
      };
      add(result.images, images); add(result.videos, videos);
    } catch (e) {
      errors.push({ provider: name, message: e.message || 'Provider failed', status: e.status || null });
    }
  }

  // If the first provider had some results but not enough, the loop has already rotated into the next provider.
  const all = { images: images.slice(0, 8), videos: videos.slice(0, 8) };
  return json(200, {
    query: q,
    images: all.images,
    videos: all.videos,
    providers: {
      attempted,
      successful: attempted.filter(name => !errors.some(e => e.provider === name)),
      failed: errors,
      configured: {
        pixabay: !!clean(env.PIXABAY_API_KEY),
        pexels: !!clean(env.PEXELS_API_KEY),
        unsplash: !!clean(env.UNSPLASH_ACCESS_KEY),
        openverse: true,
        wikimedia: true,
        nasa: true,
        archive: true,
        loc: true,
        smithsonian: !!clean(env.SMITHSONIAN_API_KEY),
        flickr: !!clean(env.FLICKR_API_KEY)
      }
    },
    message: (all.images.length || all.videos.length) ? 'Media search completed with automatic provider fallback.' : 'No media found from the available providers.'
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
