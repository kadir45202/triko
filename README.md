# Triko — Moda Stil Asistanı Maskotu

E-ticaret moda sitelerinde sayfada yüzen, kombin öneren, canlı hissettiren animasyonlu
maskot widget'ı. Widget + ATELIER demo mağazası + lite backend tek repoda.
Tam ürün spec'i için: [PROMPT.md](PROMPT.md)

## Hızlı Başlangıç (tek komut)

```bash
npm start          # veya: node server/server.js
```

- **Mağaza (demo):** http://localhost:3001/store/
- **Analitik dashboard:** http://localhost:3001/analytics
- **Hızlı test sayfası:** http://localhost:3001/demo/

Sunucu hem statik dosyaları hem API'yi servis eder — Node 18+ yeterli, bağımlılık yok.
Söz dizimi kontrolü: `npm run check`

## Proje Durumu

| Sprint | Kapsam | Durum |
|---|---|---|
| 1 | Temel Widget (no-go zone, kombin akışı) + canlı yüz/eller/jestler | ✅ |
| 1.5 | Davranışsal kişiselleştirme (oturum profili, akıllı seçim, kişisel metin) | ✅ |
| 1.9 | Deneyim paketi: amaçlı hareket, etiket illüzyonu, mikro-diyalog, zamanlama | ✅ |
| 2 | Backend "lite" (config + event API, analitik dashboard, statik servis) | ✅ |
| 2+ | Üretim backend'i (Fastify + Prisma; SQLite ile geliştirme, PostgreSQL'e hazır) | ✅ |
| 3 | Yönetim Paneli MVP (Next.js 14 + Tailwind) | ✅ |
| 4 | Görsel Pipeline (upload + arkaplan silme arayüzü + CDN ucu) | ✅ |
| 5 | AI Öneri Motoru (claude-haiku-4-5 + kural bazlı fallback) | ✅ |
| 6 | Analitik ve Raporlama tam sürüm (heatmap, gelir tahmini, CSV, dedup) | ✅ |
| 7 | Cila ve Üretim (güvenlik, testler, Docker, KVKK/deploy dokümanları) | ✅ |

## Maskot Yetenekleri

**Karakter (Triko):** gradyanlı top gövde, papyon, yanaklar, salınan antenler,
zemin gölgesi; yürürken yöne eğilir + hoplar, varışta iniş esnemesi yapar.

- **Canlı yüz:** göz bebekleri en yakın ürüne bakar, kullanıcı yaklaşınca imleci
  takip eder, göz kırpar; 6 ifade (mutlu/heyecanlı/düşünüyor/üzgün/uykulu/şaşkın)
- **Amaçlı hareket:** rastgele gezinti ile *ürün ziyareti* arasında geçiş yapar —
  bir ürüne yürür, durur, bakar, düşünür; yakınsa öneri o anda doğar. Kullanıcı
  bir ürüne 2.5 sn+ bakarsa maskot yavaşça o ürüne sokulur (dwell).
- **Etiket illüzyonu:** önerilen ürün, maskotun elinden iple sarkan ve hafifçe
  sallanan bir ürün etiketi olarak görünür; öneri anında etiket üründen maskotun
  eline uçar ("gidip aldı, getirdi" hissi).
- **Mikro-diyalog:** ilk ziyarette kendini tanıtır, tekrar ziyarette "Yine hoş
  geldin! 👋" der; ✕ ile kapatılınca "Tamam tamam, karışmıyorum 😄" diye söylenir;
  sepete ekle tıklanınca alkışlayıp kutlar.
- **Zamanlama görgüsü:** kullanıcı aktif scroll ederken proaktif öneri yapmaz
  (yavaşlamasını bekler); imleç pencereden çıkarken oturumda 1 kez exit-intent
  önerisi; 45 sn etkileşimsizlikte uyuklar (💤), hızlı scroll'da şaşırır.
- **Jestler:** kombin sunarken el sallar + etiketi sunar, düşünürken el çenede,
  maskot önerisiyle ürüne gelince alkışlar, tıklanınca zıplar + stil ipucu verir.
- **Kişiselleştirme (client-side, sıfır maliyet):** gezilen ürünlerin
  renk/kategori/fiyatı anonim oturum profiline yazılır (localStorage, 24 saat,
  KVKK uyumlu); kombin havuzundan profile en uygun öneri seçilir; eşleşmede
  "Siyah parçaları seviyorsun galiba 🖤" tarzı kişisel satır çıkar.
- **Attribution:** maskot önerisinden gidilen ürün sayfası `?ref=maskot` ile
  açılır — "✨ Triko önerdi" rozeti görünür, ziyaret ve sepete ekleme backend'e sayılır.
- **Güvenli alan:** maskot 4 kenardan sınırlıdır (üstte balon, altta etiket payı);
  konuşma balonu her pozisyonda tam okunur.

## Backend (Sprint 2 lite)

Sıfır bağımlılık Node sunucusu (`server/server.js`):

- `GET  /api/widget/config` — widget config'i (widget açılışta çeker, 800ms
  cevap yoksa yerel config ile sessizce devam eder)
- `POST /api/widget/event` — analitik event kaydı (`server/events.jsonl`),
  token başına 100/dk rate limit, session bazlı dedup
- `GET  /api/analytics/summary` — özet JSON
- `GET  /analytics` — canlı dashboard (oturum, gösterim, önizleme/geçiş oranları)
- `GET  /store|/widget|/demo` — statik dosya servisi (path-traversal korumalı)
- Backend kapalıysa widget sessizce console-only çalışır (`data-api` opsiyonel)

## Üretim Backend'i (Faz 2+) ve Yönetim Paneli (Faz 3)

Demo dışında, gerçek SaaS altyapısı `backend/` ve `panel/` dizinlerinde:

```bash
# Backend — Fastify + Prisma (ilk kurulum)
cd backend
npm install
cp .env.example .env
npx prisma migrate dev      # SQLite veritabanını kurar + seed'ler
npm run dev                 # http://localhost:4000

# Panel — Next.js 14 (ayrı terminalde)
cd panel
npm install
npm run dev                 # http://localhost:3100
```

Panel girişi (seed'lenen demo hesabı): **demo@triko.app / triko123** — widget token: `demo`.

- **Backend:** JWT auth (access + refresh), kombin CRUD, maskot ayarları,
  analitik (overview / kombin bazlı / zaman serisi), widget config (5 dk cache)
  ve event ucu (token başına 100/dk rate limit). Geliştirmede SQLite; şemadaki
  iki satır değişikliğiyle PostgreSQL'e geçer (`backend/prisma/schema.prisma`
  başındaki nota bak). Redis yerine aynı arayüzlü in-memory cache kullanılır.
- **Panel:** Genel bakış (30 günlük seri + dönüşüm hunisi), kombin liste /
  oluştur / düzenle / aç-kapa, maskot ayarları (canlı önizlemeli), analitik
  (dönem filtresi, en iyi kombinler, cihaz dağılımı, kombin tablosu), kurulum
  kodu + platform kılavuzları (Shopify, WooCommerce, Ticimax, İkas) ve hesap
  sayfaları. API istekleri Next rewrites ile backend'e proxy'lenir.

## Faz 4-7: Üretim Yetenekleri

- **Görsel pipeline (Faz 4):** Panelden maskot/ürün görseli yüklenir
  (`/api/mascot/upload-image`, `/api/combos/upload-image`); `REMBG_URL`
  yapılandırıldıysa arkaplan otomatik silinir, yoksa görsel olduğu gibi
  kullanılır. Yüklemeler `/uploads/` altından cache başlıklarıyla servis
  edilir; widget dağıtımı için CDN origin ucu: `/cdn/widget.js`.
- **AI öneri motoru (Faz 5):** Widget, kullanıcının oturumda gezdiği
  ürünlerden "✨ Bunları da seversin" önerileri gösterir
  (`POST /api/widget/recommendations`). `ANTHROPIC_API_KEY` tanımlıysa
  claude-haiku-4-5 ile, değilse kural bazlı motorla üretilir; oturum başına
  10 dk cache'lenir. Maskota ilk tıklamada öneri balonu açılır.
- **Tam analitik (Faz 6):** Saatlik tıklama heatmap'i, tahmini ek gelir
  kartı (sepet × ortalama sepet değeri), CSV dışa aktarma ve event
  deduplication (aynı oturumda aynı event 30 dk içinde tek sayılır).
- **Cila ve üretim (Faz 7):** Widget domain kilidi (`allowedDomains` +
  Origin/Referer doğrulaması), güvenlik başlıkları, 8 testlik backend test
  paketi (`cd backend && npm test`), Dockerfile'lar + `docker-compose.yml`
  (PostgreSQL dahil), [KVKK.md](KVKK.md) ve [DEPLOYMENT.md](DEPLOYMENT.md).

## Dizin Yapısı

```
triko/
├── PROMPT.md          # Tam geliştirici spec'i
├── package.json       # npm start / npm run check
├── widget/
│   └── widget.js      # Maskot widget (tek dosya, vanilla JS, bağımlılıksız)
├── server/
│   └── server.js      # Lite backend + statik servis (sıfır bağımlılık)
├── backend/           # Üretim backend'i — Fastify + Prisma (Faz 2+)
│   ├── prisma/        # Şema, migration'lar, seed
│   └── src/           # app + routes (auth, widget, combos, mascot, analytics, account)
├── panel/             # Yönetim paneli — Next.js 14 + Tailwind (Faz 3)
│   ├── app/           # login + dashboard sayfaları (App Router)
│   └── components/    # UI kartları, formlar, SVG grafikler
├── demo/
│   └── index.html     # Tek sayfalık hızlı test sayfası
└── store/             # ATELIER — 5 sayfalık görsel odaklı demo mağaza
    ├── index.html     # Anasayfa (hero + öne çıkanlar + yeni gelenler)
    ├── kadin.html     # Kadın koleksiyonu (7 ürün)
    ├── erkek.html     # Erkek koleksiyonu (7 ürün)
    ├── urun.html      # Ürün detay (?id= ile katalogdan dolar)
    ├── lookbook.html  # Hazır kombin vitrini
    └── assets/
        ├── store.css    # Mağaza stili
        ├── products.js  # Ürün kataloğu + kombin haritası + maskot entegrasyonu
        └── img/         # 14 gerçek ürün fotoğrafı (Unsplash)
```

## ATELIER Demo Mağaza

Tamamen görsel odaklı — sepet/arama/favori sadece ikon, hiçbir şey satın alınmaz.
Amaç: maskotun gerçekçi bir e-ticaret ortamında kombin önerisi yapmasını test etmek.

- 14 ürünlük katalog (7 kadın + 7 erkek) tek dosyada: `store/assets/products.js`
- Her ürünün kombin eşleri `COMBO_MAP`'te tanımlı — maskot balonunda bu öneriler çıkar
- Her sayfa `ATELIER.initMascot(...)` ile kendi bağlamına uygun kombinleri yükler:
  ürün sayfasında o ürünün kombinleri, kategori sayfalarında kategori seçkisi
- Maskotun önerdiği etikete tıklayınca önizleme modalı → "Ürünü İncele" → ürün sayfası

Maskot ~4 saniye sonra ilk kombin önerisini yapar. Analitik event'leri tarayıcı
konsolunda `[maskot:event]` etiketiyle, backend açıksa `/analytics`'te görünür.

## Widget Entegrasyonu (müşteri sitesi)

```html
<script src="https://cdn.maskot.app/widget.js"
        data-token="MUSTERI_TOKEN"
        data-api="https://api.maskot.app"
        async></script>
```

Config öncelik sırası: yerleşik varsayılanlar < API config < sayfanın
`window.MASKOT_CONFIG` override'ı. `data-api` verilmezse widget tamamen
istemci tarafında çalışır.

## Mühendislik Kuralları

- **No-go zone:** ürün görseli, fiyat, sepete ekle, beden seçici, nav, checkout
  formları + `[data-maskot-nogo]` ile manuel işaretleme; 24px padding,
  scroll/resize'da debounced yenileme. Maskot bu alanların üzerine asla gelmez.
- **Hareket:** sadece CSS transition + transform (rAF yok, layout/paint yok);
  waypoint'ler viewport yüzdesi, 4 kenar güvenli sınırına kelepçeli.
- **Sağlamlık:** tüm kod `safely()` sarmalayıcısıyla — hata olursa widget sayfayı
  bozmadan kendini kapatır. `!important` yok, `all: initial` ile CSS izolasyonu,
  `prefers-reduced-motion` desteği, i18n hazır metin yapısı.
- **KVKK:** kimlik bilgisi yok; anonim session ID 24 saatte sıfırlanır, IP saklanmaz.
