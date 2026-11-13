/* 好物外链图片的本地缓存：只在浏览器本机存一份，云端仍然只存链接、不存图。
   只拦截 http(s) 的 <img> 请求（destination === 'image'），缓存优先、网络兜底；
   页面自身的 JS/CSS 和 Supabase 接口请求一律不碰，避免把应用代码缓成旧版本。 */
const CACHE = 'fin-img-v1';
const MAX_ENTRIES = 400;   // 只保留最近的 400 张，超出按写入顺序淘汰

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(k);
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      // 清掉旧版本图片缓存，不影响其他缓存
      await Promise.all(keys.filter(k => k.indexOf('fin-img-') === 0 && k !== CACHE).map(k => caches.delete(k)));
    } catch (err) { /* 缓存不可用则忽略 */ }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.destination !== 'image') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  e.respondWith((async () => {
    let cache = null;
    try { cache = await caches.open(CACHE); } catch (err) { /* 缓存不可用就走网络 */ }

    if (cache) {
      try {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
      } catch (err) { /* ignore */ }
    }

    try {
      const resp = await fetch(req);
      // 成功响应或跨域不透明响应才入库；206 分段内容不缓存
      if (cache && (resp.ok || resp.type === 'opaque') && resp.status !== 206) {
        cache.put(req, resp.clone()).then(() => trim(cache)).catch(() => {});
      }
      return resp;
    } catch (err) {
      // 断网时尽量用旧缓存顶上
      if (cache) {
        try {
          const old = await cache.match(req, { ignoreVary: true });
          if (old) return old;
        } catch (e2) { /* ignore */ }
      }
      throw err;
    }
  })());
});
