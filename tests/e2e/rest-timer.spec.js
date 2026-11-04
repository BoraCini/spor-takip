import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

const restOn = (page) => page.evaluate(async () => (await import('./js/db.js')).getSetting('rest_timer', true));

test('dinlenme sayacı Ayarlar\'dan kapatılır: çalışan sayaç durur, set tamamlanınca başlamaz; yeniden açılabilir', async ({ page }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const { today, addDays } = await import('./js/util.js');
    const ex = await db.put('exercises', { name: 'Test Bench Press', muscle: 'Göğüs', kind: 'agirlik' });
    const day = await db.put('program_days', { routine: true, title: 'Test Rutin', subtitle: '' });
    await db.put('program_exercises', { day_id: day.id, exercise_id: ex.id, order: 0, target_sets: 3, target_reps: '8', superset: false });
    await db.put('workout_sessions', { date: today(), routine_id: day.id, routine_title: 'Test Rutin' });
    // önceki antrenman: setlerde kilo/tekrar önerisi gelsin
    for (const n of [1, 2, 3]) await db.put('workout_sets', { date: addDays(today(), -3), exercise_id: ex.id, set_no: n, weight_kg: 60, reps: 8, done: true });
  });

  // varsayılan: açık
  await go(page, 'antrenman', 1500);
  await page.locator('.set-check[data-n="1"]').first().click();
  await expect(page.locator('#restbar')).toBeVisible();

  // Ayarlar'dan kapat: çalışan sayaç da durur, süre seçimi gizlenir
  await go(page, 'ayarlar', 1200);
  await expect(page.locator('#rest-sec')).toBeVisible();
  await page.locator('#rest-on').uncheck({ force: true });
  await expect(page.locator('#toast')).toContainText('Dinlenme sayacı kapalı');
  expect(await restOn(page)).toBe(false);
  await expect(page.locator('#rest-sec')).toBeHidden();
  await expect(page.locator('#restbar')).toBeHidden();

  // kapalıyken set tamamlanınca sayaç başlamaz
  await go(page, 'antrenman', 1500);
  await page.locator('.set-check[data-n="2"]').first().click();
  await expect(page.locator('.set-check[data-n="2"]').first()).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(800);
  await expect(page.locator('#restbar')).toBeHidden();

  // yeniden aç: ayar ve süre seçimi geri gelir, sonraki sette sayaç başlar
  await go(page, 'ayarlar', 1200);
  await expect(page.locator('#rest-on')).not.toBeChecked();
  await page.locator('#rest-on').check({ force: true });
  expect(await restOn(page)).toBe(true);
  await expect(page.locator('#rest-sec')).toBeVisible();
  await go(page, 'antrenman', 1500);
  await page.locator('.set-check[data-n="3"]').first().click();
  await expect(page.locator('#restbar')).toBeVisible();
  expect(errors).toEqual([]);
});
