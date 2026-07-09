# Moda Maskot SaaS — Geliştirici Promptu

## Projeye Genel Bakış

E-ticaret moda sitelerine entegre edilen, sayfada özgürce yüzen animasyonlu bir stil asistanı maskot sistemi geliştiriyoruz. Sistem üç temel bileşenden oluşuyor:

1. **Maskot Widget** — Müşteri sitesine eklenen frontend script
2. **Yönetim Paneli** — Markaların kombinlerini, maskot görsellerini ve ayarlarını yönettiği dashboard
3. **Backend API** — Widget ile panel arasındaki veri akışını ve AI öneri motorunu yöneten sunucu

Ürün SaaS modeliyle yıllık abonelik olarak satılıyor. Her müşteri kendi maskotunu, kendi kombinlerini ve kendi ayarlarını yönetiyor. Kaynak kodu müşteriye verilmiyor, panel üzerinden özelleştirme yapılıyor.

---

## Teknoloji Seçimleri

Aşağıdaki stack ile geliştirilecek. Farklı bir tercih için gerekçe belirt ve onay al.

**Frontend (Widget):**
- Vanilla JavaScript — framework bağımlılığı olmasın, her siteye kolayca entegre edilsin
- CSS animations — GPU hızlandırmalı, hafif
- Single JS dosyası olarak dağıtım (`<script>` tag ile ekleniyor)

**Frontend (Yönetim Paneli):**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Shadcn/ui komponent kütüphanesi
- Recharts (analitik grafikler)

**Backend:**
- Node.js + Express veya Fastify
- TypeScript
- PostgreSQL (ana veritabanı)
- Redis (cache, session)
- Prisma ORM

**AI:**
- OpenAI API veya Anthropic API — kullanıcı davranış analizi ve "bunları da seversin" önerileri için
- Model: cost-efficient seçim (GPT-4o-mini veya Claude Haiku)

**Altyapı:**
- Vercel (panel frontend)
- Railway veya Render (backend)
- Cloudflare CDN (widget JS dağıtımı)
- AWS S3 veya Cloudflare R2 (maskot görselleri, ürün fotoğrafları)

---

## Bileşen 1 — Maskot Widget

### Genel Davranış Kuralları

Widget, müşteri sitesine tek satır script tag ile ekleniyor:

```html
<script src="https://cdn.maskot.app/widget.js" data-token="MUSTERI_TOKEN"></script>
```

Script yüklenince token'ı doğrular, o müşteriye ait konfigürasyonu API'dan çeker ve maskotu başlatır.

### Güvenli Alan (Safe Zone) Sistemi

Bu sistemin en kritik parçası. Maskot hiçbir zaman şu elementlerin üzerine gelemez:

- Ürün görseli alanı (büyük fotoğraf bloğu)
- Sepete ekle / satın al butonları
- Fiyat göstergeleri
- Beden / renk seçim alanları
- Navigasyon bar
- Ödeme formu alanları

Güvenli alan tespiti şöyle çalışacak:

```javascript
// Widget başlarken çalışır
function detectNoGoZones() {
  const selectors = [
    '[data-maskot-nogo]',          // Müşteri manuel işaretleyebilir
    '.product-image, .product-photo, .pdp-image',
    '.add-to-cart, .buy-now, .sepete-ekle',
    '.product-price, .price-box',
    '.size-selector, .color-selector',
    'nav, header, .navbar',
    'form[action*="checkout"], .checkout-form',
  ];

  // + müşterinin config'inde tanımladığı custom selector'lar
  // + viewport'ta görünen kritik alanların bounding rect'leri

  return zones; // { x1, y1, x2, y2, padding: 24 }[]
}
```

Müşteri kendi sitesinin kritik alanlarını panelden manuel da işaretleyebilmeli. Panel'de bir "Alan Seç" aracı olacak — müşteri kendi sayfasının screenshot'ını görüp üzerine tıklayarak no-go zone ekleyebilecek.

### Hareket Sistemi

Maskot **önceden yazılmış senaryolar** arasında geçiş yapıyor. Runtime'da fizik hesaplama yok, sadece CSS transition ile interpolasyon.

```javascript
const MOVEMENT_SCENARIOS = {
  'left-descend':  [ /* sol kenardan aşağı iniş waypoint listesi */ ],
  'right-descend': [ /* sağ kenardan aşağı iniş */ ],
  'bottom-slide':  [ /* altta sağdan sola kayış */ ],
  'top-slide':     [ /* üstte soldan sağa */ ],
  'corner-bounce': [ /* köşeden köşeye */ ],
};

// Her waypoint:
// { xPercent: 0.04, yPercent: 0.30, durationMs: 2800, easing: 'ease-in-out' }

// Senaryo seçimi: rastgele ama aynı senaryo üst üste gelmesin
// Senaryo bitince 1.5-3 saniye idle (hafif bob animasyonu), sonra yeni senaryo
```

Waypoint koordinatları viewport yüzdesi cinsinden — responsive otomatik çalışır. Her senaryoda waypoint'e geçmeden önce no-go zone kontrolü yapılır, çakışma varsa o waypoint atlanır.

Idle durumda `transform: translateY` ile 4-6px yukarı aşağı sinüs hareketi — CSS animation, JS loop yok.

### Maskot Görsel Yapısı

```
[Konuşma Balonu]  ←  sağa veya sola açılır, pozisyona göre
     ↑
[Maskot Gövdesi]  ←  SVG veya PNG, özelleştirilebilir
     ↓
[Mini Ürün Kartı] ←  sağ alt köşede, arkaplanı silinmiş ürün görseli
```

**Mini Ürün Kartı detayları:**
- Boyut: 52x52px, border-radius: 12px
- İçinde: arkaplanı silinmiş ürün fotoğrafı
- Hafif rotasyon (-6deg) — "elinde tutuyor" hissi
- Açılış animasyonu: scale(0.4) → scale(1), cubic-bezier(.34,1.56,.64,1)

**Arkaplan silme pipeline:**
- Ürün görselleri panele yüklenirken otomatik olarak remove.bg API veya rembg (Python kütüphanesi) ile işleniyor
- İşlenmiş görsel CDN'e yükleniyor, orijinal de saklanıyor
- Widget sadece işlenmiş görseli kullanıyor

### Kombin Gösterim Akışı

```
1. Maskot harekete geçer (idle veya proximity)
2. 0.6s "düşünme" animasyonu (hafif sallanma)
3. Mini ürün kartı açılır (scale animasyonu)
4. 350ms sonra konuşma balonu açılır
5. Balon içeriği:
   - Üst: "✨ Uzman Kombini" etiketi
   - Orta: Kısa öneri metni ("Bu ikili harika uyar!")
   - Alt: Mini ürün kartı (emoji + isim + fiyat)
   - En alt: Sosyal kanıt ("X kişi bu kombini yaptı")
6. Kullanıcı mini ürün kartına tıklar → ÖNIZLEME MODU
7. Önizleme modalı açılır (ürün büyük görseli + temel bilgi)
8. Kullanıcı önizlemede tekrar tıklar → Ürün sayfasına yönlendir
9. Kullanıcı ✕ tuşuna basar → Balon kapanır, maskot devam eder
```

**Önizleme Modalı:**
- Ekranın ortasında hafif blur backdrop
- Ürünün tam görseli (arkaplan silinmiş, büyük boy)
- Ürün adı, fiyat, kısa açıklama
- "Ürünü İncele →" butonu — ürün sayfasına yönlendirir
- Kapatma butonu
- Modal açıkken maskot dondurulur (hareket etmez, balon açık kalır)

### Tetiklenme Mantığı

Maskot iki şekilde kombin önerisi yapar:

**Proaktif (zamanlayıcı):**
- Kullanıcı sayfaya geldikten 5-7 saniye sonra ilk öneri
- Sonraki öneriler arası minimum 45 saniye
- Kullanıcı balonla etkileşime girdiyse (tıkladı veya kapattı) bir sonraki öneri 90 saniye sonra
- Aynı kombin üst üste iki kez önerilmez

**Reaktif (proximity):**
- Maskot senaryo sırasında ürün görselinin yakınından geçerken (150px) öneri tetiklenir
- Bu sayede "o ürünü fark etti, getirdi" hissi oluşur

### Konfigürasyon Objesi

API'dan gelen, her müşteriye özel:

```javascript
const CONFIG = {
  token: 'xxx',
  mascot: {
    imageUrl: 'https://cdn.maskot.app/customers/xxx/mascot.png',
    size: 68,           // px
    primaryColor: '#7c3aed',
    name: 'Stil',       // maskotun adı (balonda gösterilir)
  },
  behavior: {
    proactiveDelayMs: 6000,
    proactiveIntervalMs: 50000,
    proximityThresholdPx: 150,
    dismissCooldownMs: 90000,
    maxDailyShows: 12,
    mobileEnabled: true,
    mobileSize: 52,     // mobilede küçülür
  },
  noGoSelectors: [      // müşterinin özel selector'ları
    '.custom-product-image',
    '#add-to-cart-btn',
  ],
  combos: [             // o ürün sayfasına özel kombinler (sayfa URL'ine göre)
    {
      id: 'combo_001',
      triggerProductId: 'urun-123',
      suggestedProductId: 'urun-456',
      suggestedProductName: 'Slim Fit Siyah Jean',
      suggestedProductPrice: '₺459',
      suggestedProductUrl: '/urun/slim-fit-siyah-jean',
      suggestedProductImage: 'https://cdn.maskot.app/products/processed/jean-nobg.png',
      mascotText: 'Siyah + siyah — güçlü monoblock kombin!',
      socialProof: '3.120 kişi bu kombini yaptı',
      expertNote: 'Uzman önerisi',
    },
  ],
};
```

### Analitik Event'leri

Widget her önemli aksiyonda backend'e event gönderir:

```javascript
const EVENTS = {
  MASCOT_SHOWN:        'mascot_shown',       // maskot göründü
  COMBO_SHOWN:         'combo_shown',        // balon açıldı
  COMBO_DISMISSED:     'combo_dismissed',    // ✕ ile kapatıldı
  PREVIEW_OPENED:      'preview_opened',     // mini karta tıklandı
  PRODUCT_PAGE_VISIT:  'product_page_visit', // önizlemeden ürüne gidildi
  COMBO_ADD_TO_CART:   'combo_add_to_cart',  // ürün sayfasında sepete eklendi (referral ile)
};
// Her event: { eventType, comboId, sessionId, timestamp, pageUrl }
```

---

## Bileşen 2 — Yönetim Paneli

### Sayfa Yapısı

```
/login
/dashboard
  /overview          → Genel metrikler, son aktivite
  /combos            → Kombin listesi
    /combos/new      → Yeni kombin oluştur
    /combos/[id]     → Kombin düzenle
  /mascot            → Maskot görsel ve ayarları
  /analytics         → Detaylı analitik
  /settings          → Hesap, API, fatura
  /integration       → Kurulum kodu
```

### Kombin Yönetim Sayfası (/combos)

Her kombin şu bilgileri içeriyor:

- **Tetikleyici ürün:** Hangi ürün sayfasında bu kombin gösterilsin (URL pattern veya ürün ID)
- **Önerilen ürün:** Maskotun elinde tutacağı ürün
- **Maskot metni:** Balonda çıkacak kısa metin (max 80 karakter)
- **Sosyal kanıt:** "X kişi bu kombini yaptı" metni (manuel girilebilir veya gerçek data)
- **Aktif/Pasif:** Kombini açıp kapatma
- **Öncelik sırası:** Aynı sayfada birden fazla kombin varsa hangi sırayla gösterilsin

Kombin oluştururken:
1. Tetikleyici ürünü seç (URL gir veya sitemap'ten seç)
2. Önerilen ürünü seç (aynı şekilde)
3. Ürün görseli yükle → Sistem otomatik arkaplan siler → Önizleme göster
4. Metin ve sosyal kanıt gir
5. Kaydet → Anında canlıya geçer

### Maskot Özelleştirme Sayfası (/mascot)

- Maskot görseli yükle (PNG, önerilen boyut: 200x200px, şeffaf arkaplan)
- Renk paleti: primary color, secondary color (balon rengi vb.)
- Maskot adı
- Boyut ayarı (masaüstü / mobil ayrı)
- Davranış ayarları:
  - İlk öneri gecikmesi
  - Öneri sıklığı
  - Günlük maksimum gösterim
  - Mobilede aktif/pasif
- Canlı önizleme: Ayarları değiştirirken sağ tarafta gerçek zamanlı simülasyon

### No-Go Zone Editörü

Müşteri kendi sitesinin URL'ini girer, panel bir iframe (veya screenshot) üzerinde sayfayı gösterir. Müşteri tıklayarak no-go zone çizer. Sistem bu alanları CSS selector veya koordinat olarak kaydeder.

### Analitik Sayfası (/analytics)

**Üst metrikler (kart görünümü):**
- Toplam kombin gösterimi (bu ay)
- Önizleme tıklama oranı (gösterim / önizleme)
- Ürün sayfasına geçiş oranı (önizleme / ürün sayfası)
- Maskot kaynaklı sepete ekleme (attribution window: 30dk)
- Tahmini ek gelir (ortalama sepet değeri x dönüşüm artışı)

**Grafikler:**
- Günlük kombin gösterimi (çizgi grafik, 30 gün)
- En iyi performanslı 5 kombin (bar grafik)
- Tıklama oranı saate göre dağılımı (heatmap)
- Cihaz dağılımı: masaüstü vs mobil (donut chart)

**Kombin bazlı tablo:**
Her kombinin gösterim / önizleme / ürün sayfası / sepet sayıları ve oranları.

### Kurulum Sayfası (/integration)

Müşterinin kendi sitesine ekleyeceği tek satır kod:

```html
<script src="https://cdn.maskot.app/widget.js" data-token="TOKEN" async></script>
```

Kurulum doğrulama: Müşteri kendi site URL'ini girince sistem o sayfaya istek atıp widget'ın yüklenip yüklenmediğini kontrol eder. "✅ Kurulum Doğrulandı" veya hata mesajı gösterir.

Desteklenen platform kılavuzları: Shopify, WooCommerce, Ticimax, İkas, custom HTML.

---

## Bileşen 3 — Backend API

### Endpoint Listesi

**Widget endpoint'leri (public, token auth):**

```
GET  /api/widget/config?token=xxx&url=ENCODED_URL
     → O sayfaya özel konfigürasyon döner (maskot ayarları + ilgili kombinler)
     → Redis'te 5 dakika cache

POST /api/widget/event
     → Analitik event'i kaydeder
     → Body: { token, eventType, comboId, sessionId, pageUrl }
     → Rate limit: 100 req/dk per token
```

**Panel endpoint'leri (private, JWT auth):**

```
Auth:
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh

Kombin:
GET    /api/combos
POST   /api/combos
GET    /api/combos/:id
PUT    /api/combos/:id
DELETE /api/combos/:id
PATCH  /api/combos/:id/toggle

Maskot:
GET  /api/mascot/settings
PUT  /api/mascot/settings
POST /api/mascot/upload-image   → S3'e yükler, rembg ile işler

Analitik:
GET /api/analytics/overview?period=30d
GET /api/analytics/combos?period=30d
GET /api/analytics/timeseries?metric=shows&period=30d

Hesap:
GET  /api/account
PUT  /api/account
GET  /api/account/subscription
```

### Veritabanı Şeması (PostgreSQL + Prisma)

```prisma
model Customer {
  id            String   @id @default(cuid())
  email         String   @unique
  companyName   String
  token         String   @unique @default(cuid())
  plan          Plan     @default(STARTER)
  planExpiresAt DateTime?
  createdAt     DateTime @default(now())

  mascotSettings MascotSettings?
  combos         Combo[]
  events         AnalyticsEvent[]
}

model MascotSettings {
  id              String   @id @default(cuid())
  customerId      String   @unique
  customer        Customer @relation(fields: [customerId], references: [id])

  imageUrl        String?
  primaryColor    String   @default("#7c3aed")
  mascotName      String   @default("Stil")
  sizeDesktop     Int      @default(68)
  sizeMobile      Int      @default(52)

  proactiveDelayMs    Int  @default(6000)
  proactiveIntervalMs Int  @default(50000)
  proximityThresholdPx Int @default(150)
  maxDailyShows       Int  @default(12)
  mobileEnabled       Boolean @default(true)

  noGoSelectors   String[] @default([])
  updatedAt       DateTime @updatedAt
}

model Combo {
  id                   String   @id @default(cuid())
  customerId           String
  customer             Customer @relation(fields: [customerId], references: [id])

  triggerUrlPattern    String   // regex veya exact URL
  triggerProductId     String?

  suggestedProductName  String
  suggestedProductPrice String
  suggestedProductUrl   String
  suggestedProductImageOriginal  String?  // S3 URL
  suggestedProductImageProcessed String?  // arkaplan silinmiş S3 URL

  mascotText    String
  socialProof   String?
  expertNote    String?

  priority      Int     @default(0)
  isActive      Boolean @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  events        AnalyticsEvent[]
}

model AnalyticsEvent {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  comboId    String?
  combo      Combo?   @relation(fields: [comboId], references: [id])

  eventType  String   // EVENTS enum
  sessionId  String
  pageUrl    String
  deviceType String?  // 'mobile' | 'desktop'
  createdAt  DateTime @default(now())

  @@index([customerId, createdAt])
  @@index([comboId, eventType])
}

enum Plan {
  STARTER
  GROWTH
  ENTERPRISE
}
```

### AI Öneri Motoru

AI sadece "bunları da seversin" bölümü için kullanılıyor — kombin önerileri değil. Kombin önerileri uzman kadronun girdiği statik veri.

```javascript
// Kullanıcının o oturumda baktığı ürünler toplanıyor (session bazlı, cookie)
// Her X dakikada bir veya sayfa değişiminde AI'a gönderiliyor

const prompt = `
Sen bir moda stil asistanısın.
Kullanıcı bu oturumda şu ürünlere baktı:
${viewedProducts.map(p => `- ${p.name} (${p.category}, ${p.color}, ${p.priceRange})`).join('\n')}

Bu ürünlere bakma kalıbından kullanıcının stil tercihlerini çıkar.
Mevcut ürün kataloğundan şu kriterlere göre 4 ürün öner:
- Kullanıcının renk tercihine uygun
- Fiyat aralığına yakın
- Daha önce bakmadığı ürünler
- Aynı kategoriden en fazla 2 öneri

Yanıtı SADECE JSON formatında ver:
{ "recommendations": [{ "productId": "...", "reason": "kısa Türkçe gerekçe (max 4 kelime)" }] }
`;
```

Token maliyeti minimumda tutmak için:
- Aynı oturum için 10 dakikada bir çalışır, araya giren sayfa ziyaretleri cache'i kullanır
- Input: sadece ürün adı, kategori, renk, fiyat aralığı — fotoğraf analizi yok
- Model: claude-haiku-4-5 veya gpt-4o-mini

---

## Güvenlik Gereksinimleri

- Widget token'ları her müşteriye unique, backend'de bcrypt hash olarak saklıyor
- Widget sadece o token'ın kayıtlı domain'lerinden çalışır (CORS + referrer kontrolü)
- Panel JWT access token 15dk, refresh token 7 gün
- Analitik event'leri rate-limited: 100/dk per token
- Ürün görselleri ve maskot görselleri signed URL ile erişiliyor (CDN)
- KVKK uyumu: analitik event'lerinde kullanıcı IP'si saklanmıyor, session ID cookie bazlı ve 24 saatte sıfırlanıyor

---

## KVKK / Gizlilik

Widget yüklenirken şu bilgileri açıkça işliyor:
- Oturum bazlı anonim ID (24 saatte sıfırlanan cookie)
- Ziyaret edilen sayfa URL'leri
- Hangi kombinleri gördüğü / tıkladığı

Kullanıcı adı, e-posta, gerçek kimlik bilgisi hiçbir şekilde saklanmıyor. Müşteri siteye entegrasyon sözleşmesinde bunu kabul ediyor.

---

## Performans Gereksinimleri

Widget kritik performans kuralları:

- Widget JS dosyası max 40KB (minified + gzipped)
- `async` ile yükleniyor — sayfanın render'ını bloke etmiyor
- İlk API isteği (config fetch) 500ms altında tamamlanmalı
- Widget yüklendikten sonra ek API isteği yok — config ve combo data tek seferde geliyor
- Maskot animasyonları sadece CSS transform ve opacity kullanıyor (compositor thread, layout/paint yok)
- requestAnimationFrame kullanılmıyor — sadece CSS animation ve transition
- Mobilede pil tüketimini azaltmak için `prefers-reduced-motion` media query destekleniyor

---

## Test Gereksinimleri

**Widget testleri:**
- Farklı e-ticaret platformlarında (Shopify, WooCommerce, custom) kurulum ve çalışma
- No-go zone tespiti: yaygın Türk e-ticaret temalarında doğruluk
- Mobil cihaz testi: iOS Safari, Android Chrome
- Performans: Lighthouse skoru widget eklenince 5 puandan fazla düşmemeli

**Panel testleri:**
- Kombin CRUD işlemleri
- Görsel yükleme ve arkaplan silme pipeline
- Analitik hesaplamalarının doğruluğu

**Backend testleri:**
- Rate limiting
- Token domain doğrulama
- Cache tutarlılığı (Redis invalidation)
- Analitik event deduplication (aynı session aynı eventi çift saymasın)

---

## Geliştirme Sırası (Önerilen)

### Sprint 1 — Temel Widget
Widget JS iskeletini kur. Hardcoded config ile maskot sayfada dolaşsın. No-go zone sistemi çalışsın. Kombin gösterim + önizleme + yönlendirme akışı çalışsın. Analitik event'leri console'a yazdır (henüz backend yok).

### Sprint 2 — Backend API
Config endpoint'i kur. Analitik event endpoint'i kur. PostgreSQL şemasını oluştur. Redis cache entegrasyonu. Widget'ı gerçek API'a bağla.

### Sprint 3 — Yönetim Paneli MVP
Login sayfası. Kombin oluşturma/düzenleme. Maskot ayarları. Kurulum kodu sayfası. Basit analitik özeti.

### Sprint 4 — Görsel Pipeline
S3 entegrasyonu. Arkaplan silme (rembg veya remove.bg). CDN konfigürasyonu. Signed URL sistemi.

### Sprint 5 — AI Öneri Motoru
Kullanıcı davranış toplayıcı (session bazlı). AI prompt entegrasyonu. "Bunları da seversin" bölümü widget'a eklenir.

### Sprint 6 — Analitik ve Raporlama
Detaylı analitik sayfası. Grafik bileşenleri. Kombin performans tablosu.

### Sprint 7 — Cila ve Üretim
Performans optimizasyonu. Güvenlik audit. KVKK belgesi. Müşteri onboarding akışı. Hata izleme (Sentry). Uptime monitör.

---

## Önemli Notlar

**Kodun genelinde şu prensiplere uy:**

Widget tarafında hiçbir zaman `!important` CSS kullanma — müşteri sitesiyle çakışma yaratır. Bunun yerine widget container'ına yüksek specificity class yaz.

Widget hataları sessizce fail etmeli — bir hata fırlarsa kullanıcı deneyimini bozmadan widget devre dışı kalmalı. Hiçbir hata müşteri sitesinin konsolunda kullanıcıya görünmemeli.

Tüm metinler i18n hazır yaz — şimdilik Türkçe ama yapı genişlemeye hazır olsun.

Panel'de tüm formlar optimistic UI ile çalışsın — kullanıcı kaydet'e basınca hemen "kaydedildi" göster, hata olursa geri al. Yavaş API bekleme hissi verme.

Widget'ın müşteri sitesiyle çakışma ihtimali olan her CSS property için `all: initial` veya CSS Modules mantığıyla izolasyon sağla.
