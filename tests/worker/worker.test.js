import { describe, it, expect, beforeEach } from 'vitest';
import { makeKV } from '../helpers/kv.js';
import worker, { isPreviewHost, pushEndpointOk, _resetRateLimits } from '../../worker/index.js';

let env;
const req = (method, path, { body, headers = {}, ip = '10.9.9.9', host = 'spor-takip.ornek.workers.dev' } = {}) => {
  const h = new Headers(headers);
  h.set('cf-connecting-ip', ip);
  return worker.fetch(new Request(`https://${host}${path}`, { method, headers: h, body }), env, { waitUntil() {} });
};
const TOKEN = 'a'.repeat(40);

beforeEach(() => {
  env = { PUSH_KV: makeKV(), ASSETS: { fetch: async () => new Response('asset') } };
  _resetRateLimits();
});

describe('Sağlık kutusu', () => {
  it('açılmamış kutuya veri kabul etmez, açıldıktan sonra eder', async () => {
    expect((await req('POST', `/api/inbox/${TOKEN}`, { body: '{"steps":5000}' })).status).toBe(404);
    expect((await req('GET', `/api/inbox/${TOKEN}`)).status).toBe(200);
    expect((await req('POST', `/api/inbox/${TOKEN}`, { body: '{"steps":5000}' })).status).toBe(200);
    const r = await (await req('GET', `/api/inbox/${TOKEN}`)).json();
    expect(r.items[0].steps).toBe(5000);
  });
  it('silindikten sonra veri kabul etmez', async () => {
    await req('GET', `/api/inbox/${TOKEN}`);
    await req('DELETE', `/api/inbox/${TOKEN}`);
    expect((await req('POST', `/api/inbox/${TOKEN}`, { body: '{"steps":1}' })).status).toBe(404);
  });
});

describe('Bildirim adresleri', () => {
  it('yalnızca bilinen push servisleri', () => {
    expect(pushEndpointOk('https://web.push.apple.com/x')).toBe(true);
    expect(pushEndpointOk('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(pushEndpointOk('https://evil.example.com/x')).toBe(false);
    expect(pushEndpointOk('https://web.push.apple.com.evil.com/x')).toBe(false);
    expect(pushEndpointOk('http://web.push.apple.com/x')).toBe(false);
  });
});

describe('Hız sınırı', () => {
  it('aynı IP dakikada 20 yazmadan sonra 429', async () => {
    const codes = [];
    for (let i = 0; i < 22; i++) codes.push((await req('POST', '/api/push/sync', { body: '{}', ip: '7.7.7.7' })).status);
    expect(codes.slice(0, 20).every((c) => c !== 429)).toBe(true);
    expect(codes.slice(20)).toEqual([429, 429]);
  });
});

describe('Önizleme ayrımı', () => {
  it('önizleme adresini tanır', () => {
    expect(isPreviewHost('p0-guvenlik-spor-takip.bora.workers.dev')).toBe(true);
    expect(isPreviewHost('abc123-spor-takip.bora.workers.dev')).toBe(true);
    expect(isPreviewHost('spor-takip.bora.workers.dev')).toBe(false);
  });
  it('önizlemedeki kayıtlar üretim anahtarlarına dokunmaz', async () => {
    const host = 'p0-guvenlik-spor-takip.bora.workers.dev';
    await req('GET', `/api/inbox/${TOKEN}`, { host });
    const keys = [...env.PUSH_KV._map.keys()];
    expect(keys).toEqual([`pv:ib:${TOKEN}`]);
    expect((await req('POST', `/api/inbox/${TOKEN}`, { body: '{"steps":1}' })).status).toBe(404);
  });
});
