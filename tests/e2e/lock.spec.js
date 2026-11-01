import { test, expect } from '@playwright/test';

// WebAuthn IP adresinde çalışmaz; aynı sunucuya localhost ile git
const ROOT = 'http://localhost:8788/';

async function onboardNoPin(page) {
  await page.goto(ROOT);
  await page.click('[data-go]', { timeout: 60_000 });
  await page.click('[data-nopin]', { timeout: 60_000 });
  await page.waitForTimeout(600);
}
async function setPinViaSettings(page, pin) {
  await page.goto(ROOT + '#/ayarlar');
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('.wprompt-back').forEach((e) => e.remove()));
  await page.click('[data-act="pin-set"]');
  await expect(page.locator('.lock .pin-dots i')).toHaveCount(6);
  await page.keyboard.type(pin);
  await page.waitForTimeout(400);
  await page.keyboard.type(pin);
  await expect(page.locator('#toast')).toContainText('PIN', { timeout: 10_000 });
}

test('yanlış PIN denemelerinde bekleme başlar, tuş takımı kapanır; yeniden açınca sürer', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'tek tarayıcıda yeterli');
  await onboardNoPin(page);
  await setPinViaSettings(page, '482913');
  await page.reload();
  await expect(page.locator('.lock h1')).toHaveText('PIN kodunu gir');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.type('000000');
    await page.waitForTimeout(500);
  }
  await expect(page.locator('.lock [data-msg]')).toContainText('Çok fazla yanlış deneme');
  await expect(page.locator('.lock [data-k="1"]')).toBeDisabled();
  await page.reload();
  await expect(page.locator('.lock [data-msg]')).toContainText('Çok fazla yanlış deneme');
  // süre dolunca (sayacı ileri sararak) doğru PIN açar
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const f = await db.getSetting('pin_fail');
    await db.setSetting('pin_fail', { ...f, until: Date.now() - 1 });
  });
  await page.waitForTimeout(1300);
  await page.keyboard.type('482913');
  await expect(page.locator('.lock')).toHaveCount(0, { timeout: 10_000 });
});

test('Face ID (sanal doğrulayıcı) imza doğrulamasıyla açar', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'sanal doğrulayıcı yalnızca Chromium CDP ile');
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await onboardNoPin(page);
  await setPinViaSettings(page, '135790');
  await page.goto(ROOT + '#/ayarlar');
  await page.waitForTimeout(1200);
  await page.locator('label[for="faceid"]').click();
  await expect(page.locator('#toast')).toContainText('Face ID', { timeout: 10_000 });
  const cred = await page.evaluate(async () => (await import('./js/db.js')).getSetting('faceid_cred'));
  expect(cred).toMatchObject({ alg: -7 });
  expect(cred.pk.length).toBeGreaterThan(80);
  await page.reload();
  // kilit ekranı açılır ve Face ID kendiliğinden doğrulayıp kapatır (çizilmesini ve doğrulamanın bitmesini bekle)
  await page.waitForTimeout(2500);
  await expect(page.locator('.lock')).toHaveCount(0, { timeout: 15_000 });
  expect(await page.evaluate(() => document.body.classList.contains('locked'))).toBe(false);
  // açık anahtar bozulursa imza doğrulanamaz → kilit açık kalır, PIN istenir
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const c = await db.getSetting('faceid_cred');
    const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', other.publicKey));
    await db.setSetting('faceid_cred', { ...c, pk: btoa(String.fromCharCode(...spki)) });
  });
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.locator('.lock h1')).toHaveText('PIN kodunu gir');
  await page.keyboard.type('135790');
  await expect(page.locator('.lock')).toHaveCount(0, { timeout: 10_000 });
});
