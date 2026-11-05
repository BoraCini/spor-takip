import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

test('tahlil ekranı: kaynak etiketleri, kıyaslanamayanlar, kür notu ve elle aralık', async ({ page }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('cycles', { start_date: '2026-09-01', weeks: 12 });
    const t = await db.put('lab_tests', { date: '2026-10-01', lab_name: 'Test Lab' });
    await db.put('lab_values', { test_id: t.id, marker_key: 'lh', name: 'LH', value: 0.1, unit: 'mIU/mL', ref_low: 1.7, ref_high: 8.6, ref_source: 'rapor' });
    await db.put('lab_values', { test_id: t.id, marker_key: 'glu', name: 'Açlık glukozu', value: 5.4, unit: 'mmol/L', ref_low: null, ref_high: null });
    await db.put('lab_values', { test_id: t.id, marker_key: 'hct', name: 'Hematokrit', value: 54, unit: '%', ref_low: 40, ref_high: 52 });
  });
  await go(page, 'kan', 1500);
  const out = page.locator('.sec', { hasText: 'Referans dışında' });
  await expect(out).toBeVisible();
  await expect(page.locator('.lab-row', { hasText: 'LH' })).toContainText('Laboratuvar aralığı');
  await expect(page.locator('.lab-row', { hasText: 'LH' })).toContainText('kayıtlı protokol dönemine denk geliyor');
  await expect(page.locator('.lab-row', { hasText: 'Hematokrit' })).toContainText('Genel aralık');
  await expect(page.locator('.lab-row', { hasText: 'Hematokrit' })).toContainText('raporda aralık yoktu');
  await expect(page.locator('.sec', { hasText: 'Otomatik kıyaslanamayanlar' })).toBeVisible();
  await expect(page.locator('.lab-row', { hasText: 'Açlık glukozu' })).toContainText('uyuşmuyor');
  await expect(page.getByText('Tıbbi cihaz değildir.')).toBeVisible();
  await expect(page.getByText('beklenen', { exact: false })).toHaveCount(0);

  // aralığı elle değiştir → kaynak "Senin girdiğin aralık"
  await page.click('[data-act="edit"]');
  const row = page.locator('[data-vrow]', { has: page.locator('[aria-label="Hematokrit referans üst"]') });
  await row.locator('[data-f="hi"]').fill('55');
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('Test kaydedildi');
  await page.waitForTimeout(800);
  const hct = page.locator('.lab-row', { hasText: 'Hematokrit' });
  await page.click('[data-act="normal"]');
  await expect(hct).toContainText('Senin girdiğin aralık');
  const src = await page.evaluate(async () => (await (await import('./js/db.js')).list('lab_values')).map((v) => [v.name, v.ref_source]));
  expect(src).toContainEqual(['Hematokrit', 'manuel']);
  expect(src).toContainEqual(['LH', 'rapor']);
  expect(errors).toEqual([]);
});
