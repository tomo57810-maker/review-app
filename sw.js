// ネットワーク優先で、オフライン時はキャッシュを使う。共有(Share Target)の受け口も兼ねる。
const CACHE = 'review-app-v1';
const ASSETS = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/util.js', 'js/db.js', 'js/store.js', 'js/cards.js',
  'js/add.js', 'js/study.js', 'js/quiz.js', 'js/manage.js', 'js/importer.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'share-inbox').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith(handleShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

async function handleShare(req) {
  const fd = await req.formData();
  const files = fd.getAll('files').filter((f) => f instanceof File && f.size > 0);
  const c = await caches.open('share-inbox');
  const base = self.registration.scope;
  const meta = {
    title: fd.get('title') || '',
    text: fd.get('text') || '',
    url: fd.get('url') || '',
    files: files.length,
  };
  await c.put(new URL('__share/meta', base), new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
  for (let i = 0; i < files.length; i++) {
    await c.put(
      new URL('__share/file-' + i, base),
      new Response(files[i], { headers: { 'content-type': files[i].type, 'x-name': encodeURIComponent(files[i].name) } })
    );
  }
  return Response.redirect(new URL('./#/add?share=1', base).href, 303);
}
