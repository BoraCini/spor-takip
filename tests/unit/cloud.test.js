import { describe, it, expect } from 'vitest';
import { installServer } from '../helpers/server.js';

const PASS = 'test icin uzun bir sifre';

async function setup() {
  const srv = installServer();
  const db = await import('../../public/js/db.js');
  await db.init();
  const cloud = await import('../../public/js/cloud.js');
  return { srv, db, cloud };
}

describe('Bulut yedeği (PC02)', () => {
  it('yükler ve aynı şifreyle geri açar', async () => {
    const { db, cloud } = await setup();
    await db.put('food_logs', { date: '2026-10-02', meal: 'aksam', name: 'Mercimek', grams: 250, kcal: 160 });
    const up = await cloud.cloudUpload(PASS);
    expect(up.ok).toBe(true);
    const { data } = await cloud.cloudDownload(PASS);
    expect(data.data.food_logs.map((f) => f.name)).toContain('Mercimek');
  });

  it('yanlış şifreyle açılmaz', async () => {
    const { cloud } = await setup();
    await cloud.cloudUpload(PASS);
    await expect(cloud.cloudDownload('baska bir uzun sifre')).rejects.toThrow();
  });

  it('sunucu içeriği düz metin görmez', async () => {
    const { db, cloud, srv } = await setup();
    await db.put('food_logs', { date: '2026-10-02', meal: 'aksam', name: 'GIZLIYEMEK', grams: 1, kcal: 1 });
    await cloud.cloudUpload(PASS);
    const stored = [...srv.kv._map.entries()].find(([k]) => k.startsWith('bk:'));
    const bytes = new Uint8Array(stored[1].value);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('PC02');
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('GIZLIYEMEK');
  });
});
