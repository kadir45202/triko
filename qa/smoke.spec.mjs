// Triko müşteriye-hazırlık SMOKE testi (Playwright).
//
// Kurulum (bir kez):
//   cd .. && npm i -D @playwright/test && npx playwright install chromium
// Çalıştırma (demo sunucu 3001 ve backend 4000 açıkken):
//   STORE_URL=http://localhost:3001 PANEL_URL=http://localhost:3100 \
//   npx playwright test qa/smoke.spec.mjs
//
// Amaç: mağaza vitrini + maskot kombin akışı + panel girişi gerçek tarayıcıda
// uçtan uca çalışıyor mu — "müşteriye sunulacak kadar doğru mu" kapısı.
// Panel selektörleri projeye göre değişebilir; kırılırsa yorumları izleyip güncelle.
import { test, expect } from '@playwright/test';

const STORE = process.env.STORE_URL || 'http://localhost:3001';
const PANEL = process.env.PANEL_URL || 'http://localhost:3100';

test.describe('ATELIER mağaza vitrini', () => {
  test('anasayfa grid\'leri ürünle dolu', async ({ page }) => {
    await page.goto(STORE + '/store/');
    await expect(page.locator('#featured-grid .card').first()).toBeVisible();
    expect(await page.locator('#featured-grid .card').count()).toBeGreaterThan(0);
    expect(await page.locator('#new-grid .card').count()).toBeGreaterThan(0);
    // Bozuk görsel kalmamalı (naturalWidth 0 = yüklenememiş)
    const broken = await page.locator('#featured-grid img').evaluateAll(
      (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    );
    expect(broken).toBe(0);
  });

  test('kadın/erkek kategori sayfaları genişlemiş katalogla dolu', async ({ page }) => {
    await page.goto(STORE + '/store/kadin.html');
    await expect(page.locator('#kadin-grid .card').first()).toBeVisible();
    expect(await page.locator('#kadin-grid .card').count()).toBeGreaterThanOrEqual(15);
    await page.goto(STORE + '/store/erkek.html');
    expect(await page.locator('#erkek-grid .card').count()).toBeGreaterThanOrEqual(15);
  });
});

test.describe('Maskot kombin akışı', () => {
  test('ürün sayfasında maskot beliriyor ve kombin öneriyor', async ({ page }) => {
    await page.goto(STORE + '/store/urun.html?id=k-elbise-midi');
    // Widget enjekte edildi mi?
    await expect(page.locator('.maskot-w')).toBeVisible({ timeout: 15000 });
    // Maskotu dürt (proaktif baloncuğu beklemek yerine tıkla)
    await page.locator('.maskot-mover, .maskot-body').first().click({ trial: false }).catch(() => {});
    // Kombin baloncuğu / önerilen ürün görünmeli (tıklama açmazsa proaktif gösterim yakalar)
    await expect(
      page.locator('.maskot-balloon, .maskot-b-product, .maskot-mini').first(),
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Panel', () => {
  // NOT: panel arayüzü selektörleri projeye göre değişebilir. Test kırılırsa
  // aşağıdaki alan/rol adlarını panelin gerçek etiketlerine göre güncelle.
  test('demo hesabıyla giriş yapılabiliyor', async ({ page }) => {
    await page.goto(PANEL);
    await page.getByLabel(/e-?posta|email/i).fill('demo@triko.app');
    await page.getByLabel(/parola|şifre|password/i).fill('triko123');
    await page.getByRole('button', { name: /giriş|login|oturum aç/i }).click();
    // Girişten sonra panel içeriği görünmeli (menü/başlık)
    await expect(
      page.getByText(/katalog|kombin|maskot|analiz|çıkış/i).first(),
    ).toBeVisible({ timeout: 15000 });
  });
});
