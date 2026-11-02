import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

// Anthropic API'yi taklit et: her soruya "Cevap: <soru>" döner
async function mockClaude(page) {
  // Safari (WebKit) başka alan adına giden istekte CORS başlıklarını şart koşar; gerçek API bunları döner
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(route.request().postData());
    const last = body.messages[body.messages.length - 1];
    const q = (Array.isArray(last.content) ? last.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ') : last.content) || '';
    await route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ content: [{ type: 'text', text: 'Cevap: ' + q }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) });
  });
}
const ask = async (page, q) => {
  await page.fill('#msg', q);
  await page.click('.composer .send');
  // cevap ya da hata balonu gelene kadar bekle; hata varsa metnini göster
  await expect(page.locator('.bubble.ai, .bubble.err').last()).toBeVisible({ timeout: 15_000 });
  const err = await page.locator('.bubble.err').last().textContent().catch(() => null);
  expect(err, 'Coach hata verdi').toBeNull();
  await expect(page.locator('.bubble.ai').last()).toContainText('Cevap: ' + q);
};

test('Coach sohbetleri: aç, kapat, yeni sohbet, eskiye dön, sil', async ({ page }) => {
  page.on('console', (m) => m.type() === 'error' && console.log('konsol:', m.text()));
  page.on('requestfailed', (r) => console.log('istek başarısız:', r.method(), r.url(), r.failure() && r.failure().errorText));
  const errors = await onboard(page);
  await mockClaude(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.setSetting('api_key', 'sk-ant-e2e');
    await db.put('chat_messages', { role: 'user', text: 'Güncellemeden önceki soru' });
    await db.put('chat_messages', { role: 'assistant', text: 'Eski cevap' });
  });
  await go(page, 'danisman', 1500);
  // açılış: sohbet açık değil, eski konuşmalar listede
  await expect(page.locator('.conv-bar')).toHaveCount(0);
  await expect(page.locator('.conv-list')).toContainText('Önceki konuşmalar');
  await expect(page.locator('.chips')).toBeVisible();

  await ask(page, 'Bugün göğüs mü çalışayım?');
  await expect(page.locator('.conv-bar .conv-title')).toHaveText('Bugün göğüs mü çalışayım?');
  await expect(page.locator('.chips')).toBeHidden();
  await expect(page.getByText('Eski cevap')).toHaveCount(0); // eski sohbet bu ekranda yok

  // kapat → liste
  await page.click('[data-conv-close]');
  await expect(page.locator('.conv-bar')).toHaveCount(0);
  await expect(page.locator('.bubble')).toHaveCount(0);
  await expect(page.locator('.conv-list .row').first()).toContainText('Bugün göğüs mü çalışayım?');

  // yeni sohbet ayrı kalır
  await ask(page, 'Protein ne kadar?');
  await expect(page.locator('.bubble.me')).toHaveCount(1);
  await page.click('[data-conv-new]');
  await expect(page.locator('.conv-list .row')).toHaveCount(3);

  // eski sohbete dön, devam et
  await page.locator('.conv-list .row', { hasText: 'Bugün göğüs' }).click();
  await expect(page.locator('.bubble.me')).toHaveCount(1);
  await ask(page, 'Peki kaç set?');
  await expect(page.locator('.bubble.me')).toHaveCount(2);

  // uzun süre sonra açınca sohbet kendiliğinden kapanmış olur
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const cur = await db.getSetting('chat_current');
    for (const m of await db.list('chat_messages', (x) => x.conv_id === cur)) await db.put('chat_messages', { ...m, created_at: new Date(Date.now() - 5 * 3600e3).toISOString() });
  });
  await go(page, 'beslenme', 600);
  await go(page, 'danisman', 1500);
  await expect(page.locator('.conv-bar')).toHaveCount(0);

  // sil (Tümü listesi 4'ten fazla sohbette çıkar; burada doğrudan sayfadan dene)
  const before = await page.evaluate(async () => (await import('./js/views/danisman.js')).convList().then((l) => l.length));
  expect(before).toBe(3);
  expect(errors).toEqual([]);
});

test('Tümü listesinden sohbet silinir; kayıtlara dokunulmaz', async ({ page }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.setSetting('api_key', 'sk-ant-e2e');
    for (let i = 1; i <= 5; i++) {
      await db.put('chat_messages', { conv_id: 'c' + i, role: 'user', text: 'Sohbet ' + i });
      await db.put('chat_messages', { conv_id: 'c' + i, role: 'assistant', text: 'Cevap ' + i });
    }
    await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'Kalacak yemek', grams: 1, kcal: 1 });
  });
  await go(page, 'danisman', 1500);
  await expect(page.locator('.conv-list .row')).toHaveCount(4);
  await page.click('[data-conv-all]');
  await expect(page.locator('.sheet .conv-all-row')).toHaveCount(5);
  await page.locator('.sheet .conv-all-row', { hasText: 'Sohbet 3' }).locator('[data-del]').click();
  await page.click('.sheet [data-ok]');
  await expect(page.locator('.sheet .conv-all-row')).toHaveCount(4);
  const left = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    return [(await db.list('chat_messages')).filter((m) => m.conv_id === 'c3').length, (await db.list('food_logs')).length];
  });
  expect(left).toEqual([0, 1]);
  expect(errors).toEqual([]);
});
