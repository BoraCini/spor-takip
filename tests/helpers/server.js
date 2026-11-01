// Uygulamanın '/api/...' isteklerini aynı süreçte Worker'a yönlendirir
import worker from '../../worker/index.js';
import { makeKV } from './kv.js';

export function installServer({ ip = '10.1.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250), kv = makeKV(), fail = null } = {}) {
  const env = { PUSH_KV: kv, ASSETS: { fetch: async () => new Response('asset') } };
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    calls.push({ method: (init.method || 'GET').toUpperCase(), path: url.pathname + url.search, headers: init.headers || {} });
    if (fail && fail(url, init)) throw new TypeError('Failed to fetch');
    const headers = new Headers(init.headers || {});
    headers.set('cf-connecting-ip', ip);
    const req = new Request(url.href, { method: init.method || 'GET', headers, body: init.body });
    return worker.fetch(req, env, { waitUntil() {} });
  };
  globalThis.fetch = fetchImpl;
  if (globalThis.window) window.fetch = fetchImpl;
  return { env, kv, calls };
}

// Doğrudan Worker'a istek
export function call(env, method, path, { body, headers = {}, ip = '10.0.0.9' } = {}) {
  const h = new Headers(headers);
  h.set('cf-connecting-ip', ip);
  return worker.fetch(new Request('https://procoach.test' + path, { method, headers: h, body }), env, { waitUntil() {} });
}
