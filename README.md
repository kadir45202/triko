# AI Maskot — Moda Stil Asistanı SaaS

E-ticaret moda sitelerinde sayfada yüzen, kombin öneren animasyonlu maskot widget'ı.
Tam spec için: [PROMPT.md](PROMPT.md)

## Proje Durumu

| Sprint | Kapsam | Durum |
|---|---|---|
| 1 | Temel Widget (no-go zone, kombin akışı) + canlı yüz/eller/jestler | ✅ Tamamlandı |
| 1.5 | Davranışsal kişiselleştirme (oturum profili, akıllı kombin seçimi, kişisel metin) | ✅ Tamamlandı |
| 2 | Backend "lite" (event kaydı, config, analitik dashboard — sıfır bağımlılık Node) | ✅ Tamamlandı |
| 2+ | Üretim backend'i (Fastify + PostgreSQL + Redis + Prisma) | ⬜ |
| 3 | Yönetim Paneli MVP (Next.js) | ⬜ |
| 4 | Görsel Pipeline (S3, rembg, CDN) | ⬜ |
| 5 | AI Öneri Motoru | ⬜ |
| 6 | Analitik ve Raporlama (tam sürüm) | ⬜ |
| 7 | Cila ve Üretim | ⬜ |

## Maskot Yetenekleri

- **Canlı yüz:** göz bebekleri en yakın ürüne bakar, kullanıcı yaklaşınca imleci takip eder,
  göz kırpar; 6 ifade (mutlu/heyecanlı/düşünüyor/üzgün/uykulu/şaşkın)
- **Jestler:** kombin sunarken el sallar + kartı sunar, düşünürken el çenede, maskot
  önerisiyle ürüne gelince alkışlar, 45 sn etkileşimsizlikte uyuklar (💤), hızlı scroll'da şaşırır
- **Tıklama:** maskota tıklayınca zıplar + rastgele stil ipucu balonu açar
- **Kişiselleştirme (client-side, sıfır maliyet):** gezilen ürünlerin renk/kategori/fiyatı
  anonim oturum profiline yazılır (localStorage, 24 saat, KVKK uyumlu); kombin havuzundan
  profile en uygun öneri seçilir; eşleşmede balonda "Siyah parçaları seviyorsun galiba 🖤"
  tarzı kişisel satır çıkar
- **Attribution:** maskot önerisinden gidilen ürün sayfası `?ref=maskot` ile açılır —
  sayfada "✨ Stil önerdi" rozeti görünür, ziyaret backend'e sayılır

## Backend (Sprint 2 lite)

```bash
node server/server.js   # http://localhost:3001
```

- `POST /api/widget/event` — widget event'leri buraya düşer (`server/events.jsonl`),
  token başına 100/dk rate limit, session bazlı dedup
- `GET /api/analytics/summary` — özet JSON
- `GET /analytics` — canlı dashboard (oturum, gösterim, önizleme/geçiş oranları, kombin tablosu)
- Backend kapalıysa widget sessizce console-only çalışır (`data-api` attribute'u opsiyonel)

## Dizin Yapısı

```
ai-maskot/
├── PROMPT.md          # Tam geliştirici spec'i
├── widget/
│   └── widget.js      # Maskot widget (tek dosya, vanilla JS)
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
        └── products.js  # Ürün kataloğu + kombin haritası + maskot entegrasyonu
```

## Demo'yu Çalıştırma

```bash
cd ai-maskot
python3 -m http.server 8080
# Mağaza:      http://localhost:8080/store/
# Hızlı test:  http://localhost:8080/demo/
```

## ATELIER Demo Mağaza

Tamamen görsel odaklı — sepet/arama/favori sadece ikon, hiçbir şey çalışmaz.
Amaç: maskotun gerçekçi bir e-ticaret ortamında kombin önerisi yapmasını test etmek.

- 14 ürünlük katalog (7 kadın + 7 erkek) tek dosyada: `store/assets/products.js`
- Her ürünün kombin eşleri `COMBO_MAP`'te tanımlı — maskot balonunda bu öneriler çıkar
- Her sayfa `ATELIER.initMascot(...)` ile kendi bağlamına uygun kombinleri yükler:
  ürün sayfasında o ürünün kombinleri, kategori sayfalarında kategori seçkisi
- Ürün görselleri şimdilik emoji + gradient "fotoğraf" — gerçek görsele geçmek için
  katalogdaki `visual`/`gradient` alanlarını image URL ile değiştirmek yeterli
- Maskotun önerdiği ürüne tıklayınca önizleme modalı → "Ürünü İncele" → ürün sayfası

Maskot ~4 saniye sonra ilk kombin önerisini yapar. Analitik event'leri
tarayıcı konsolunda `[maskot:event]` etiketiyle görünür.

## Widget Entegrasyonu

```html
<script src="https://cdn.maskot.app/widget.js" data-token="MUSTERI_TOKEN" async></script>
```

Sprint 1'de config hardcoded'dır; `window.MASKOT_CONFIG` ile override edilebilir
(demo sayfasında örneği var). Sprint 2'de config `GET /api/widget/config`'den gelecek.

## Sprint 1'de Uygulanan Kurallar

- **No-go zone:** ürün görseli, fiyat, sepete ekle, beden seçici, nav, checkout
  formları + `[data-maskot-nogo]` ile manuel işaretleme. 24px padding'li,
  scroll/resize'da debounced yenileme.
- **Hareket:** 5 önceden yazılmış senaryo (left/right-descend, bottom/top-slide,
  corner-bounce), waypoint'ler viewport yüzdesi, sadece CSS transition +
  transform (rAF yok, layout/paint yok).
- **Kombin akışı:** düşünme (0.6s) → mini kart (scale pop) → balon (350ms sonra)
  → önizleme modalı → ürün sayfası. Modal açıkken maskot donar.
- **Tetiklenme:** proaktif zamanlayıcı + ürün görseli yakınından geçince (150px)
  proximity tetiği. ✕'e basılırsa 90sn cooldown, aynı kombin üst üste gelmez,
  günlük gösterim limiti var.
- **Güvenlik/sağlamlık:** tüm kod `safely()` sarmalayıcısıyla — hata olursa widget
  sessizce kendini kapatır. `!important` yok, `all: initial` ile CSS izolasyonu,
  `prefers-reduced-motion` desteği, i18n hazır metin yapısı.
