import { describe, it, expect, vi } from 'vitest';

const load = async () => {
  const db = await import('../../public/js/db.js');
  await db.init();
  const lock = await import('../../public/js/lock.js');
  return { db, lock };
};

describe('PIN', () => {
  it('yeni PIN 6 haneli; eski 4 haneli PIN çalışmaya devam eder', async () => {
    const { db, lock } = await load();
    expect(lock.NEW_PIN_LEN).toBe(6);
    await lock.setPin('482913');
    expect(await lock.pinLength()).toBe(6);
    expect((await lock.verifyPin('482913')).ok).toBe(true);
    // 2.0 ve öncesinden kalma kayıt: pin_len yok
    await db.remove('settings', 'pin_len');
    expect(await lock.pinLength()).toBe(4);
  });

  it('PIN düz metin saklanmaz', async () => {
    const { db, lock } = await load();
    await lock.setPin('482913');
    const all = JSON.stringify(await Promise.all(['pin_hash', 'pin_salt', 'pin_len'].map((k) => db.getSetting(k))));
    expect(all).not.toContain('482913');
  });

  it('5 yanlıştan sonra bekleme; bekleme sırasında doğru PIN bile denenmez; süre geçince açılır ve sayaç sıfırlanır', async () => {
    const { db, lock } = await load();
    await lock.setPin('482913');
    const t0 = Date.now();
    for (let i = 1; i <= 4; i++) expect(await lock.verifyPin('000000', t0)).toMatchObject({ ok: false, waitMs: 0, fails: i });
    expect(await lock.verifyPin('000000', t0)).toMatchObject({ ok: false, waitMs: 30000, fails: 5 });
    expect(await lock.verifyPin('482913', t0 + 1000)).toMatchObject({ ok: false, locked: true });
    expect(await lock.verifyPin('482913', t0 + 31000)).toMatchObject({ ok: true });
    expect(await db.getSetting('pin_fail')).toBeNull();
  });

  it('tekrarlanan yanlışlarda bekleme kademeli artar, en fazla 60 dk; veri silinmez', async () => {
    const { db, lock } = await load();
    await db.put('food_logs', { date: '2026-10-01', name: 'Korunan', kcal: 1 });
    await lock.setPin('482913');
    let t = Date.now();
    const waits = [];
    for (let i = 0; i < 12; i++) {
      const r = await lock.verifyPin('111111', t);
      waits.push(r.waitMs / 1000);
      t += r.waitMs + 1000;
    }
    expect(waits).toEqual([0, 0, 0, 0, 30, 60, 300, 900, 3600, 3600, 3600, 3600]);
    expect(await db.list('food_logs')).toHaveLength(1);
    expect(await lock.hasPin()).toBe(true);
  });

  it('uygulama yeniden açılınca sayaç sıfırlanmaz', async () => {
    const { lock } = await load();
    await lock.setPin('482913');
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await lock.verifyPin('999999', t0);
    vi.resetModules(); // uygulamayı kapatıp açmak gibi (aynı IndexedDB)
    const again = await import('../../public/js/lock.js');
    expect((await again.pinLockState(t0 + 1000)).waitMs).toBeGreaterThan(0);
  });
});

// ---------- WebAuthn ----------
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function rawToDer(raw) {
  const int = (b) => {
    let v = [...b];
    while (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) v.shift();
    if (v[0] & 0x80) v = [0, ...v];
    return [0x02, v.length, ...v];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]).buffer;
}
async function authenticator({ rpId = 'procoach.test', origin = 'https://procoach.test' } = {}) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = await crypto.subtle.exportKey('spki', kp.publicKey);
  const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
  const cred = { id: b64(rawId), pk: b64(spki), alg: -7, signCount: 0 };
  const assert = async (challenge, { flags = 0x05, count = 0, o = origin, r = rpId, type = 'webauthn.get', tamper = false, id = rawId } = {}) => {
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(r)));
    const ad = new Uint8Array(37);
    ad.set(rpHash, 0);
    ad[32] = flags;
    new DataView(ad.buffer).setUint32(33, count);
    const cdj = enc.encode(JSON.stringify({ type, challenge: b64url(challenge), origin: o }));
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', cdj));
    const data = new Uint8Array(ad.length + 32);
    data.set(ad);
    data.set(h, ad.length);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, data));
    if (tamper) sig[5] ^= 0xff;
    return { rawId: id, response: { clientDataJSON: cdj.buffer, authenticatorData: ad.buffer, signature: rawToDer(sig) } };
  };
  return { cred, assert };
}

describe('Face ID (WebAuthn) doğrulaması', () => {
  const ctx = { origin: 'https://procoach.test', rpId: 'procoach.test' };
  it('geçerli imza kabul edilir', async () => {
    const { checkAssertion } = await import('../../public/js/lock.js');
    const a = await authenticator();
    const ch = crypto.getRandomValues(new Uint8Array(32));
    expect(await checkAssertion({ cred: a.cred, assertion: await a.assert(ch), challenge: ch, ...ctx })).toMatchObject({ ok: true });
  });
  const bad = {
    'yanlış challenge': async (a, ch) => [await a.assert(crypto.getRandomValues(new Uint8Array(32))), ch, 'challenge'],
    'yanlış origin': async (a, ch) => [await a.assert(ch, { o: 'https://kotu.site' }), ch, 'origin'],
    'yanlış RP ID': async (a, ch) => [await a.assert(ch, { r: 'kotu.site' }), ch, 'rpId'],
    'kullanıcı doğrulanmamış (UV yok)': async (a, ch) => [await a.assert(ch, { flags: 0x01 }), ch, 'UV'],
    'kullanıcı yok (UP yok)': async (a, ch) => [await a.assert(ch, { flags: 0x04 }), ch, 'UP'],
    'bozuk imza': async (a, ch) => [await a.assert(ch, { tamper: true }), ch, 'imza'],
    'yanlış tip': async (a, ch) => [await a.assert(ch, { type: 'webauthn.create' }), ch, 'tip'],
    'başka kimlik bilgisi': async (a, ch) => [await a.assert(ch, { id: new Uint8Array(16).buffer }), ch, 'kimlik'],
  };
  for (const [name, make] of Object.entries(bad)) {
    it(`reddedilir: ${name}`, async () => {
      const { checkAssertion } = await import('../../public/js/lock.js');
      const a = await authenticator();
      const ch = crypto.getRandomValues(new Uint8Array(32));
      const [assertion, challenge, why] = await make(a, ch);
      expect(await checkAssertion({ cred: a.cred, assertion, challenge, ...ctx })).toMatchObject({ ok: false, why });
    });
  }
  it('başka bir anahtarın imzası reddedilir', async () => {
    const { checkAssertion } = await import('../../public/js/lock.js');
    const a = await authenticator();
    const other = await authenticator();
    const ch = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await other.assert(ch);
    assertion.rawId = Uint8Array.from(atob(a.cred.id), (c) => c.charCodeAt(0)).buffer;
    expect(await checkAssertion({ cred: a.cred, assertion, challenge: ch, ...ctx })).toMatchObject({ ok: false, why: 'imza' });
  });
  it('imza sayacı geriye giderse reddedilir (kopyalanmış anahtar)', async () => {
    const { checkAssertion } = await import('../../public/js/lock.js');
    const a = await authenticator();
    const ch = crypto.getRandomValues(new Uint8Array(32));
    expect(await checkAssertion({ cred: { ...a.cred, signCount: 10 }, assertion: await a.assert(ch, { count: 5 }), challenge: ch, ...ctx })).toMatchObject({ ok: false, why: 'sayac' });
    expect(await checkAssertion({ cred: { ...a.cred, signCount: 10 }, assertion: await a.assert(ch, { count: 11 }), challenge: ch, ...ctx })).toMatchObject({ ok: true, signCount: 11 });
  });
  it('eski (2.0) Face ID kaydı doğrulanamaz; yeniden açılması istenir', async () => {
    const { db, lock } = await load();
    await db.setSetting('faceid_cred', 'eskikimlik==');
    expect(await lock.hasFaceId()).toBe(false);
    expect(await lock.faceIdNeedsReenroll()).toBe(true);
    expect(await lock.verifyFaceId()).toBe(false);
  });
});
