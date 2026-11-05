import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

test('tema: varsayılan cam; Ayarlar\'dan klasiğe geçilir, yeniden açılışta korunur', async ({ page }) => {
  const errors = await onboard(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  expect(await theme()).toBe('glass');
  // cam temada kartlar yarı saydam; performans için kartlarda ve alt sayfalarda bulanıklık (backdrop-filter) yok
  await go(page, 'beslenme', 1200);
  const glassCard = await page.locator('.card').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter || 'none' };
  });
  expect(glassCard.bg).toMatch(/rgba\(.*0\.\d+\)/);
  expect(glassCard.blur).toBe('none');
  await page.locator('.meal-add').first().click();
  const sheetBlur = await page.locator('.sheet').last().evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter || 'none');
  expect(sheetBlur).toBe('none');
  await page.keyboard.press('Escape');

  await go(page, 'ayarlar', 1200);
  await expect(page.locator('[data-theme-pick="glass"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-theme-pick="classic"]');
  expect(await theme()).toBe('classic');
  await expect(page.locator('[data-theme-pick="classic"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(async () => (await import('./js/db.js')).getSetting('theme'))).toBe('classic');

  await page.reload();
  // sayfa çizilmeden önce uygulanır (telefondaki kopyadan)
  expect(await theme()).toBe('classic');
  await go(page, 'beslenme', 1200);
  const classicCard = await page.locator('.card').first().evaluate((el) => getComputedStyle(el).backdropFilter || 'none');
  expect(classicCard).toBe('none');

  await go(page, 'ayarlar', 1200);
  await page.click('[data-theme-pick="glass"]');
  expect(await theme()).toBe('glass');
  expect(errors).toEqual([]);
});

test('cam tema: telefon açık/koyu değiştirince arka plan anında değişir; sayfa geçişinde arka plan tek ve sabit', async ({ page }) => {
  const errors = await onboard(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await go(page, 'beslenme', 1200);
  const bg = () => page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
  const light = await bg();
  expect(await page.evaluate(() => document.documentElement.dataset.scheme)).toBe('light');
  // uygulama açıkken koyu moda geç
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.scheme)).toBe('dark');
  const dark = await bg();
  expect(dark).not.toBe(light);
  expect(dark).toContain('linear-gradient');

  // sekme geçişinde sayfalar saydam (arka plan katmanı yerinde), eski sayfa solar
  await page.click('#tabbar [data-tab="antrenman"]');
  const during = await page.evaluate(() => {
    const g = document.querySelector('.view-ghost');
    const v = document.getElementById('view');
    return g && { ghostBg: getComputedStyle(g).backgroundImage, viewBg: getComputedStyle(v).backgroundImage, anims: g.getAnimations().length };
  });
  expect(during).toBeTruthy();
  expect(during.ghostBg).toBe('none');
  expect(during.viewBg).toBe('none');
  await expect(page.locator('.view-ghost')).toHaveCount(0, { timeout: 3000 });
  expect(errors).toEqual([]);
});
