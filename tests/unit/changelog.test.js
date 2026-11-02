import { describe, it, expect } from 'vitest';
import { CHANGELOG, cmpVersion, notesSince, FIRST_TRACKED } from '../../public/js/changelog.js';

describe('Sürüm notları', () => {
  it('sürüm karşılaştırması sayısal', () => {
    expect(cmpVersion('2.10.0', '2.9.1')).toBe(1);
    expect(cmpVersion('2.2.0', '2.2')).toBe(0);
    expect(cmpVersion('2.1.1', '2.2.0')).toBe(-1);
    expect(cmpVersion(null, '0.0.1')).toBe(-1);
  });
  it('en üstteki not uygulama sürümüyle aynı; notlar yeniden eskiye sıralı ve dolu', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('public/js/app.js', 'utf8'));
    const sw = await import('node:fs').then((fs) => fs.readFileSync('public/sw.js', 'utf8'));
    expect(sw).toContain("'js/changelog.js'");
    const ver = src.match(/APP_VERSION = '([^']+)'/)[1];
    expect(CHANGELOG[0].version).toBe(ver);
    for (let i = 1; i < CHANGELOG.length; i++) expect(cmpVersion(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBe(1);
    for (const e of CHANGELOG) {
      expect(e.title && e.date).toBeTruthy();
      expect(e.sections.length).toBeGreaterThan(0);
      for (const s of e.sections) expect(s.items.length).toBeGreaterThan(0);
    }
  });
  it('görülen sürümden sonrakiler gösterilir; bilgi yoksa ' + FIRST_TRACKED + ' sonrası', () => {
    expect(notesSince('2.2.0', '2.2.1').map((e) => e.version)).toEqual(['2.2.1']);
    expect(notesSince('2.1.0', '2.2.1').map((e) => e.version)).toEqual(['2.2.1', '2.2.0', '2.1.1']);
    expect(notesSince(null, '2.2.1').map((e) => e.version)).toEqual(['2.2.1', '2.2.0', '2.1.1']);
    expect(notesSince('2.2.1', '2.2.1')).toEqual([]);
    // uygulamadan daha yeni notlar (henüz yayınlanmamış) gösterilmez
    expect(notesSince('2.1.1', '2.2.0').map((e) => e.version)).toEqual(['2.2.0']);
  });
  it('görülen sürüm cihaza özel: yedeğe girmez, geri yüklemede telefondaki korunur', async () => {
    const db = await import('../../public/js/db.js');
    await db.init();
    await db.setSetting('seen_version', '2.2.1');
    const b = await db.exportAll();
    expect(b.data.settings.find((r) => r.id === 'seen_version')).toBeUndefined();
    await db.importAll({ ...b, data: { ...b.data, settings: [...b.data.settings, { id: 'seen_version', value: '1.0.0' }] } });
    expect(await db.getSetting('seen_version')).toBe('2.2.1');
  });
});
