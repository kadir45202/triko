import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/cache';
import { rateLimitOk } from '../lib/rateLimit';
import { ProductLite, recommend } from '../lib/recommend';
import { originAllowed } from '../lib/domains';

const EVENT_TYPE = /^[a-z][a-z0-9_]{2,39}$/;

function urlMatches(pattern: string, url: string): boolean {
  if (!pattern) return true;
  try {
    return new RegExp(pattern).test(url);
  } catch {
    return url.includes(pattern);
  }
}

export async function widgetRoutes(app: FastifyInstance) {
  // Sayfaya özel widget konfigürasyonu — 5 dk cache
  app.get('/api/widget/config', async (req, reply) => {
    const { token, url } = req.query as { token?: string; url?: string };
    if (!token) return reply.code(400).send({ error: 'token_required' });

    const cacheKey = 'wcfg:' + token + ':' + (url || '');
    const cached = await cacheGet(cacheKey);
    if (cached) return reply.header('x-cache', 'hit').send(JSON.parse(cached));

    const customer = await prisma.customer.findUnique({
      where: { token },
      include: {
        mascotSettings: true,
        // Onay bekleyen (pending) ajan kombinleri widget'a asla çıkmaz
        combos: { where: { isActive: true, status: 'published' }, orderBy: { priority: 'desc' } },
      },
    });
    if (!customer) return reply.code(404).send({ error: 'not_found' });
    if (!originAllowed(req, customer.allowedDomains)) return reply.code(403).send({ error: 'domain_not_allowed' });

    const s = customer.mascotSettings;
    const combos = customer.combos
      .filter((c) => !url || urlMatches(c.triggerUrlPattern, url))
      .map((c) => ({
        id: c.id,
        triggerUrlPattern: c.triggerUrlPattern,
        triggerProductId: c.triggerProductId,
        product: {
          name: c.suggestedProductName,
          price: c.suggestedProductPrice,
          url: c.suggestedProductUrl,
          image: c.suggestedProductImageProcessed || c.suggestedProductImageOriginal,
        },
        mascotText: c.mascotText,
        socialProof: c.socialProof,
        expertNote: c.expertNote,
        priority: c.priority,
      }));

    const config = {
      mascot: {
        name: s?.mascotName ?? 'Triko',
        primaryColor: s?.primaryColor ?? '#7c3aed',
        imageUrl: s?.imageUrl ?? null,
        sizeDesktop: s?.sizeDesktop ?? 68,
        sizeMobile: s?.sizeMobile ?? 52,
      },
      behavior: {
        proactiveDelayMs: s?.proactiveDelayMs ?? 6000,
        proactiveIntervalMs: s?.proactiveIntervalMs ?? 50000,
        proximityThresholdPx: s?.proximityThresholdPx ?? 150,
        maxDailyShows: s?.maxDailyShows ?? 12,
        mobileEnabled: s?.mobileEnabled ?? true,
        noGoSelectors: JSON.parse(s?.noGoSelectors ?? '[]'),
      },
      combos,
    };

    await cacheSet(cacheKey, JSON.stringify(config), 300);
    return reply.header('x-cache', 'miss').send(config);
  });

  // Mağaza vitrini için müşterinin aktif kataloğu (public, token ile).
  // Demo mağaza ızgarasını backend'den besler; 60 sn cache.
  app.get('/api/widget/catalog', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) return reply.code(400).send({ error: 'token_required' });

    const cacheKey = 'wcat:' + token;
    const cached = await cacheGet(cacheKey);
    if (cached) return reply.header('x-cache', 'hit').send(JSON.parse(cached));

    const customer = await prisma.customer.findUnique({ where: { token }, select: { id: true, allowedDomains: true } });
    if (!customer) return reply.code(404).send({ error: 'not_found' });
    if (!originAllowed(req, customer.allowedDomains)) return reply.code(403).send({ error: 'domain_not_allowed' });

    const products = await prisma.product.findMany({
      where: { customerId: customer.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        externalId: true, name: true, price: true, currency: true,
        imageUrl: true, url: true, category: true, color: true,
      },
    });
    const payload = {
      products: products.map((p) => ({
        id: p.externalId,
        name: p.name,
        price: p.price,
        currency: p.currency,
        image: p.imageUrl,
        url: p.url,
        category: p.category,
        color: p.color,
      })),
    };
    await cacheSet(cacheKey, JSON.stringify(payload), 60);
    return reply.header('x-cache', 'miss').send(payload);
  });

  // "Bunları da seversin" — AI öneri motoru (Faz 5).
  // Oturum başına 10 dk cache; token başına 20 istek/dk rate limit.
  app.post('/api/widget/recommendations', async (req, reply) => {
    const body = (req.body || {}) as {
      token?: string; sessionId?: string;
      viewed?: ProductLite[]; catalog?: ProductLite[];
    };
    const { token, sessionId } = body;
    const viewed = Array.isArray(body.viewed) ? body.viewed.slice(0, 20) : [];
    const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 200) : [];
    if (!token || !sessionId) return reply.code(400).send({ error: 'token_and_sessionId_required' });
    if (viewed.length < 3 || catalog.length < 4) {
      return { source: 'none', recommendations: [] }; // profil henüz yetersiz
    }
    if (!rateLimitOk('rec:' + token, 20, 60_000)) return reply.code(429).send({ error: 'rate_limited' });

    const customer = await prisma.customer.findUnique({ where: { token }, select: { id: true, allowedDomains: true } });
    if (!customer) return reply.code(404).send({ error: 'not_found' });
    if (!originAllowed(req, customer.allowedDomains)) return reply.code(403).send({ error: 'domain_not_allowed' });

    const cacheKey = 'rec:' + token + ':' + sessionId;
    const cached = await cacheGet(cacheKey);
    if (cached) return reply.header('x-cache', 'hit').send(JSON.parse(cached));

    const result = await recommend(viewed, catalog);
    await cacheSet(cacheKey, JSON.stringify(result), 600);
    return reply.header('x-cache', 'miss').send(result);
  });

  // Analitik event kaydı — token başına 100 istek/dk
  app.post('/api/widget/event', async (req, reply) => {
    const body = (req.body || {}) as {
      token?: string; eventType?: string; comboId?: string;
      sessionId?: string; pageUrl?: string; deviceType?: string;
    };
    const { token, eventType, sessionId, pageUrl } = body;
    if (!token || !eventType || !sessionId || !pageUrl) {
      return reply.code(400).send({ error: 'token_eventType_sessionId_pageUrl_required' });
    }
    if (!EVENT_TYPE.test(eventType)) return reply.code(400).send({ error: 'invalid_event_type' });
    if (!rateLimitOk('ev:' + token, 100, 60_000)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }

    const customer = await prisma.customer.findUnique({ where: { token }, select: { id: true, allowedDomains: true } });
    if (!customer) return reply.code(404).send({ error: 'not_found' });
    if (!originAllowed(req, customer.allowedDomains)) return reply.code(403).send({ error: 'domain_not_allowed' });

    // Deduplication: aynı oturumda aynı event + kombin 30 dk içinde tekrar sayılmaz
    const dupe = await prisma.analyticsEvent.findFirst({
      where: {
        customerId: customer.id,
        sessionId,
        eventType,
        comboId: body.comboId || null,
        pageUrl,
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (dupe) return { ok: true, deduped: true };

    await prisma.analyticsEvent.create({
      data: {
        customerId: customer.id,
        comboId: body.comboId || null,
        eventType,
        sessionId,
        pageUrl,
        deviceType: body.deviceType === 'mobile' ? 'mobile' : 'desktop',
      },
    });
    return { ok: true };
  });
}
