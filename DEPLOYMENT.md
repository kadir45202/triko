# Triko — Üretime Alma Kılavuzu

## Hızlı yol: Docker Compose

```bash
docker compose up --build
# Panel:   http://localhost:3100  (demo@triko.app / triko123)
# Backend: http://localhost:4000/api/health
```

Compose; PostgreSQL, backend ve paneli birlikte ayağa kaldırır. İlk açılışta
migration'lar otomatik uygulanır. Seed için: `docker compose exec backend npx tsx prisma/seed.ts`

> Not: Compose PostgreSQL kullanır — `backend/prisma/schema.prisma` başındaki
> nota göre provider'ı `postgresql` yapıp `noGoSelectors`/`plan` alanlarını
> native tiplere çevirin, sonra `prisma migrate dev` ile yeni migration üretin.

## Bulut hedefleri (PROMPT.md spec'i)

| Bileşen | Hedef | Not |
|---|---|---|
| Panel | Vercel | `panel/` kökü; `BACKEND_URL` env'i backend adresine |
| Backend | Railway / Render | `backend/` kökü; Dockerfile hazır |
| Widget | Cloudflare CDN | Origin: backend `/cdn/widget.js` (cache başlıkları ayarlı) |
| Görseller | S3 / R2 | `backend/src/lib/storage.ts` arayüzü hazır; disk yerine S3 implementasyonu takılır |
| Veritabanı | PostgreSQL (Railway/Neon) | `DATABASE_URL` |
| Cache | Redis (opsiyonel) | `backend/src/lib/cache.ts` arayüzü Redis'le birebir |

## Ortam değişkenleri (backend)

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite (`file:./dev.db`) veya PostgreSQL bağlantı dizesi |
| `JWT_SECRET` | ✅ (üretimde) | Panel oturum imzası — güçlü ve gizli olmalı |
| `PORT` | — | Varsayılan 4000 |
| `ANTHROPIC_API_KEY` | — | AI öneri motoru; yoksa kural bazlı fallback |
| `REMBG_URL` | — | Arkaplan silme servisi; yoksa görsel olduğu gibi kullanılır |

## Üretim kontrol listesi

- [ ] `JWT_SECRET` güçlü bir değerle değiştirildi
- [ ] PostgreSQL'e geçildi (şema notundaki 2 satır + migration)
- [ ] Müşteri kayıtlarına `allowedDomains` girildi (widget domain kilidi)
- [ ] Widget CDN üzerinden servis ediliyor (`/cdn/widget.js` origin)
- [ ] `npm test` (backend) ve `npm run build` (panel) CI'da çalışıyor
- [ ] Hata izleme (Sentry vb.) ve uptime monitörü bağlandı — kod tarafında
      hazırlık gerekmez; Fastify logger JSON çıktı verir
- [ ] KVKK.md müşteri sözleşmesine eklendi
