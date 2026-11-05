import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

test('tema: varsayılan cam; Ayarlar\'dan klasiğe geçilir, yeniden açılışta korunur', async ({ page }) => {
  const errors = await onboard(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  expect(await theme()).toBe('glass');
  // cam temada kartlar saydam ve bulanık
  await go(page, 'beslenme', 1200);
  const glassCard = await page.locator('.card').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter };
  });
  expect(glassCard.bg).toMatch(/rgba\(.*0\.\d+\)/);
  expect(glassCard.blur).toContain('blur');

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
