// Ortak adımlar
export async function onboard(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.click('[data-go]', { timeout: 60_000 });
  await page.click('[data-nopin]', { timeout: 60_000 });
  await page.waitForTimeout(600);
  return errors;
}
export async function go(page, hash, wait = 1200) {
  await page.goto('/#/' + hash);
  await page.waitForTimeout(wait);
  await page.evaluate(() => document.querySelectorAll('.wprompt-back').forEach((e) => e.remove()));
}
