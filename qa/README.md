# Triko — Müşteriye-Hazırlık QA

İki katman: (1) **Claude for Chrome / manuel** görsel-etkileşim checklist'i, (2) tek
komutla koşan **Playwright smoke** testi. İkisi de canlı sunucular gerektirir.

## Ön koşul: sunucuları başlat

```bash
# 1) Backend (API) — port 4000
cd backend && npm run dev          # veya: npm start

# 2) Demo mağaza + widget — port 3001
npm start                          # kök dizinde (server/server.js)

# 3) Panel (Next.js) — port 3100  (panel testi için)
cd panel && npm run dev
```

Seed hesabı: **demo@triko.app / triko123** (widget token: `demo`).

---

## 1) Manuel checklist (Claude for Chrome ile)

Bunu tarayıcıda Claude for Chrome'a adım adım yaptırabilirsin. Her madde bir kabul kriteri.

### Mağaza vitrini — http://localhost:3001/store/
- [ ] "Öne Çıkanlar" ve "Yeni Gelenler" grid'leri ürünle dolu, **bozuk görsel yok**
      (görseli olmayan ürünler emoji + gradient gösteriyor, kırık resim ikonu yok).
- [ ] Backend açıksa en altta **"🤖 Katalogdan Taranan Ürünler"** bölümü görünüyor;
      kapalıysa bu bölüm hiç çıkmıyor (ATELIER vitrini tek başına tutarlı).
- [ ] **Kadın** sayfası ~21, **Erkek** ~20 ürün gösteriyor.

### Maskot kombin akışı — bir ürüne gir (ör. Saten Gece Elbisesi)
- [ ] Sağ altta maskot beliriyor.
- [ ] Maskot bu ürüne **uygun** bir kombin öneriyor (gece elbisesine spor ayakkabı DEĞİL;
      topuklu/çanta/şık parça). Önerilen ürün adı + görseli/emoji görünüyor.
- [ ] Öneriye tıklayınca ilgili ürün sayfasına gidiyor.
- [ ] Farklı kategorilerden 3-4 ürün dene: kombinler mantıklı ve **tekrarsız**.

### Panel — http://localhost:3100
- [ ] demo@triko.app / triko123 ile giriş yapılıyor.
- [ ] **Katalog**: ürünler + kategoriler + tarama geçmişi görünüyor.
- [ ] **Site taraması**: bir URL için önce **Ön-kontrol** çalışıyor (aşağıya bak),
      sonra "Tara" katalogu dolduruyor; ilerleme/durum güncelleniyor.
- [ ] **Kombinler / Onay Kuyruğu**: ajan kombinleri listeleniyor; yayınla/pasifle çalışıyor.
- [ ] **Plan/kullanım** göstergesi (varsa) doğru sayıyor (ör. ürün X/limit).
- [ ] Maskot ayarları ve Analitik sayfaları açılıyor.

### Yeni: Ön-kontrol (site uyumu) — hızlı doğrulama
`/api/catalog/preflight` teşhis döndürür. Panelden ya da doğrudan:
- Taranabilir site (JSON-LD/Shopify) → **ok**.
- React/Vue SPA (sunucu HTML'i boş) → **spa_risk** + açıklama.
- Bot koruması → **blocked**. Erişilemez → **unreachable**.

---

## 2) Otomatik smoke (Playwright)

```bash
# Kurulum (bir kez) — kök dizinde:
npm i -D @playwright/test
npx playwright install chromium

# Çalıştır (sunucular açıkken):
STORE_URL=http://localhost:3001 PANEL_URL=http://localhost:3100 \
  npx playwright test qa/smoke.spec.mjs
```

Kapsam: mağaza grid'leri dolu + bozuk görsel yok, kategori sayfaları genişlemiş
katalogla dolu, ürün sayfasında maskot beliriyor ve kombin öneriyor, panel girişi.

> Panel selektörleri arayüze göre değişebilir; `qa/smoke.spec.mjs` içindeki
> Panel testinde alan/rol adlarını gerekirse güncelle.

---

## Backend birim/entegrasyon testleri

```bash
cd backend && npm test        # 48 test: api, ajan, kuyruk, crawler, preflight, plan
```
