import { test, expect } from '@playwright/test';

// 2.0.2'den güncelleyen bir kullanıcının telefonundaki durum: 4 haneli PIN (pin_len yok), açık anahtarsız eski Face ID kaydı,
// düz metin bulut şifresi + PC02 yedek, kaynak alanı olmayan tahlil değerleri, Coach paylaşım ayarı yok, API anahtarı var.
test('2.0.2 → 2.1.0 geçişi: veriler korunur, eski ayarlar çalışır, yükseltmeler önerilir', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'tek tarayıcıda yeterli');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.click('[data-go]', { timeout: 60_000 });
  await page.click('[data-nopin]', { timeout: 60_000 });
  await page.waitForTimeout(600);
  const pass = 'eski kullanici sifresi ' + Date.now();
  await page.evaluate(async (pass) => {
    const db = await import('./js/db.js');
    const cloud = await import('./js/cloud.js');
    // 2.0.2'deki PIN türetmesi (değişmedi): PBKDF2-SHA256 150 bin tur, 16 bayt tuz
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('1357'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256);
    const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
    await db.setSetting('pin_salt', b64(salt));
    await db.setSetting('pin_hash', b64(bits));
    await db.setSetting('faceid_cred', 'ZXNraWtpbWxpaw==');
    await db.setSetting('api_key', 'sk-ant-eski');
    await db.setSetting('ai_share', null);
    await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'Eski kayıt', grams: 100, kcal: 100 });
    const t = await db.put('lab_tests', { date: '2026-10-01' });
    await db.put('lab_values', { test_id: t.id, marker_key: 'hct', name: 'Hematokrit', value: 54, unit: '%', ref_low: 40, ref_high: 52 });
    await db.put('lab_values', { test_id: t.id, marker_key: 'hgb', name: 'Hemoglobin', value: 18, unit: 'g/dL', ref_low: 13.2, ref_high: 17.3 });
    await db.setSetting('cloud_pass', pass);
    await cloud.cloudUpload(pass); // 2.0.2 bulut yedeği (PC02)
  }, pass);

  // uygulamayı yeniden aç: kilit 4 haneli PIN ister
  await page.reload();
  await expect(page.locator('.lock h1')).toHaveText('PIN kodunu gir');
  await expect(page.locator('.lock .pin-dots i')).toHaveCount(4);
  await expect(page.locator('.lock [data-top]')).toHaveCount(0); // eski Face ID kaydı doğrulanamaz → sunulmaz
  await page.keyboard.type('1357');
  // bir kerelik 6 haneye geçiş önerisi
  await expect(page.getByText("PIN'in 4 haneli")).toBeVisible({ timeout: 10_000 });
  await page.click('.sheet [data-sheet-close]');

  // Coach: bir kerelik bilgi, eski davranış korunur (hepsi açık)
  await page.goto('/#/danisman');
  await page.waitForTimeout(1500);
  await expect(page.getByText('Coach artık yalnızca izin verdiğin verileri görüyor')).toBeVisible();
  await expect(page.locator('.share-line')).toContainText('Tahlil');

  // Ayarlar: v2 → v3 taşıma kartı, PIN ve Face ID notları
  await page.goto('/#/ayarlar');
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.wprompt-back').forEach((e) => e.remove()));
  await expect(page.getByText('Yedeğini yeni güvenli biçime taşı.')).toBeVisible();
  await expect(page.getByText("PIN'in 4 haneli. Daha güvenli")).toBeVisible();
  await expect(page.getByText('Face ID güvenlik güncellemesi nedeniyle kapatıldı')).toBeVisible();

  // eski yedek hâlâ açılır
  const fromCloud = await page.evaluate(async (pass) => {
    const c = await import('./js/cloud.js');
    return (await c.findBackup({ who: '', pass })).data.data.food_logs.map((f) => f.name);
  }, pass);
  expect(fromCloud).toContain('Eski kayıt');

  // tahliller: kaynak çıkarımı (katalogla aynı → genel aralık, farklı → kaynağı bilinmiyor)
  await page.goto('/#/kan');
  await page.waitForTimeout(1500);
  await expect(page.locator('.lab-row', { hasText: 'Hematokrit' })).toContainText('Genel aralık');
  await expect(page.locator('.lab-row', { hasText: 'Hemoglobin' })).toContainText('Aralığın kaynağı bilinmiyor');

  // veriler yerinde
  const names = await page.evaluate(async () => (await (await import('./js/db.js')).list('food_logs')).map((f) => f.name));
  expect(names).toEqual(['Eski kayıt']);
  expect(errors).toEqual([]);
});
