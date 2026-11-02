import { describe, it, expect, vi } from 'vitest';
import { installServer, call } from '../helpers/server.js';

async function setup(opts) {
  const srv = installServer(opts);
  const db = await import('../../public/js/db.js');
  await db.init();
  const cloud = await import('../../public/js/cloud.js');
  const token = await cloud.inboxToken(true);
  await cloud.pullInbox(); // kutuyu aç
  const send = async (body) => (await call(srv.env, 'POST', `/api/inbox/${token}`, { body: JSON.stringify(body), ip: '10.5.' + Math.floor(Math.random() * 250) + '.1' })).json();
  const serverItems = async () => (await (await call(srv.env, 'GET', `/api/inbox/${token}`, { ip: '10.6.0.1' })).json()).items;
  return { srv, db, cloud, token, send, serverItems };
}
const acks = (srv) => srv.calls.filter((c) => c.path.endsWith('/ack'));

describe('Apple Sağlık aktarımı (ACK)', () => {
  it('kayıtları yazar, onaylar; sunucuda kayıt kalmaz', async () => {
    const { db, cloud, send, serverItems, srv } = await setup();
    await send({ date: '2026-10-20', steps: '9500', weight: '84,2' });
    expect(await cloud.pullInbox()).toBe(1);
    expect((await db.getSetting('daily_steps'))['2026-10-20']).toBe(9500);
    expect((await db.list('body_logs')).map((r) => r.weight_kg)).toEqual([84.2]);
    expect(acks(srv)).toHaveLength(1);
    expect(await serverItems()).toEqual([]);
  });

  it('GET kayıt silmez', async () => {
    const { send, serverItems } = await setup();
    await send({ steps: 100 });
    await serverItems();
    expect(await serverItems()).toHaveLength(1);
  });

  it('sunucuya ulaşılamazsa hiçbir şey değişmez', async () => {
    const { db, cloud, send, srv } = await setup();
    await send({ date: '2026-10-21', steps: 5000 });
    srv.calls.length = 0;
    installServer({ kv: srv.kv, fail: () => true });
    expect(await cloud.pullInbox()).toBe(0);
    expect(await db.getSetting('daily_steps', null)).toBeNull();
  });

  it('yerel yazma başarısızsa onay gönderilmez, kayıt sunucuda kalır', async () => {
    const { db, cloud, send, serverItems, srv } = await setup();
    await send({ date: '2026-10-22', steps: 7000, weight: 83 });
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('dolu', 'QuotaExceededError');
    });
    expect(await cloud.pullInbox()).toBe(0);
    vi.restoreAllMocks();
    expect(acks(srv)).toHaveLength(0);
    expect(await serverItems()).toHaveLength(1);
    expect(await db.list('body_logs')).toEqual([]);
    // sonraki açılışta başarılı
    expect(await cloud.pullInbox()).toBe(1);
    expect(await db.list('body_logs')).toHaveLength(1);
  });

  it('onay başarısız olursa (ya da uygulama onaydan önce kapanırsa) kayıt mükerrer yazılmaz', async () => {
    const { db, cloud, send, serverItems, srv } = await setup();
    await send({ date: '2026-10-23', steps: 8000, weight: 82.5 });
    installServer({ kv: srv.kv, fail: (u) => u.pathname.endsWith('/ack') });
    expect(await cloud.pullInbox()).toBe(1);
    expect(await serverItems()).toHaveLength(1); // onay ulaşmadı
    const srv2 = installServer({ kv: srv.kv });
    expect(await cloud.pullInbox()).toBe(0); // yeni kayıt yok
    expect(await db.list('body_logs')).toHaveLength(1);
    expect(acks(srv2)).toHaveLength(1); // eski kayıt yeniden onaylandı
    expect(await serverItems()).toEqual([]);
  });

  it('aynı kayıt tekrar gelirse bir kez işlenir', async () => {
    const { db, cloud, send, srv } = await setup();
    await send({ date: '2026-10-24', weight: 81 });
    installServer({ kv: srv.kv, fail: (u) => u.pathname.endsWith('/ack') });
    await cloud.pullInbox();
    await cloud.pullInbox();
    await cloud.pullInbox();
    expect(await db.list('body_logs')).toHaveLength(1);
  });

  it('onay sırasında gelen yeni kayıt silinmez', async () => {
    const { cloud, send, serverItems, srv, token } = await setup();
    await send({ date: '2026-10-25', steps: 1000 });
    // ACK isteği sunucuya ulaşmadan hemen önce Kestirme yeni kayıt gönderiyor
    const base = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/ack')) await call(srv.env, 'POST', `/api/inbox/${token}`, { body: JSON.stringify({ date: '2026-10-26', steps: 2000 }), ip: '10.7.0.1' });
      return base(input, init);
    };
    await cloud.pullInbox();
    const left = await serverItems();
    expect(left).toHaveLength(1);
    expect(left[0].steps).toBe(2000);
  });

  it('geçersiz değerler yazılmaz ama onaylanır (döngüye girmez)', async () => {
    const { db, cloud, send, serverItems } = await setup();
    await send({ date: '2026-10-27', steps: '9999999', weight: '5' });
    await cloud.pullInbox();
    expect(await db.getSetting('daily_steps', {})).toEqual({});
    expect(await db.list('body_logs')).toEqual([]);
    expect(await serverItems()).toEqual([]);
  });
});
