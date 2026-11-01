import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

test('Apple Sağlık bağlantısı: kur, veri gelsin, al, kapat', async ({ page, request }) => {
  const errors = await onboard(page);
  await go(page, 'ayarlar', 1500);
  await page.click('[data-act="health-on"]');
  await page.waitForTimeout(1200);
  const token = await page.evaluate(async () => (await import('./js/db.js')).getSetting('inbox_token'));
  await page.evaluate(() => {
    document.querySelectorAll('.sheet-backdrop').forEach((e) => e.remove());
    document.body.classList.remove('sheet-open');
  });
  const r = await request.post(`/api/inbox/${token}`, { data: { steps: '7300', weight: '84,6', date: '2026-10-30' } });
  expect(r.status()).toBe(200);
  await page.click('[data-act="health-pull"]');
  await expect(page.locator('#toast')).toContainText("Apple Sağlık'tan 1 kayıt alındı");
  const got = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    return [(await db.getSetting('daily_steps'))['2026-10-30'], (await db.list('body_logs')).map((b) => b.weight_kg)];
  });
  expect(got).toEqual([7300, [84.6]]);
  expect((await (await request.get(`/api/inbox/${token}`)).json()).items).toEqual([]);
  await page.click('[data-act="health-off"]');
  await page.waitForTimeout(800);
  expect((await request.post(`/api/inbox/${token}`, { data: { steps: 1 } })).status()).toBe(404);
  expect(errors).toEqual([]);
});
