// Ortak adımlar
// Open Food Facts'e giden canlı aramalar testlerde boş sonuçla yanıtlanır: testler dış servise bağlı olmasın
// (WebKit, CORS'suz hata yanıtlarını sayfa hatası olarak bildiriyor). Taklit gereken testler kendi yanıtını üstüne ekler.
export async function stubOFF(target) {
  await target.route(/openfoodfacts\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ products: [], hits: [], count: 0 }) })
  );
}

export async function onboard(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await stubOFF(page.context());
  await page.goto('/');
  await page.click('[data-go]', { timeout: 60_000 });
  await page.click('[data-nopin]', { timeout: 60_000 });
  await page.waitForTimeout(600);
  // Canlı Open Food Facts araması testlerde kapalı (dış servis); deneyen testler açar
  await page.evaluate(async () => (await import('./js/db.js')).setSetting('off_live', false));
  return errors;
}
export async function go(page, hash, wait = 1200) {
  await page.goto('/#/' + hash);
  // günlük kilo sorusu açılışta gecikmeli gelebilir; testlerde tıklamaları engellemesin
  await page.addStyleTag({ content: '.wprompt-back{display:none!important}' });
  await page.waitForTimeout(wait);
  await page.evaluate(() => document.querySelectorAll('.wprompt-back').forEach((e) => e.remove()));
}
