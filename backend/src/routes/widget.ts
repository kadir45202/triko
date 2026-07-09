import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/cache';
import { rateLimitOk } from '../lib/rateLimit';

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
      include: { mascotSettings: true, combos: { where: { isActive: true }, orderBy: { priority: 'desc' } } },
    });
    if (!customer) return reply.code(404).send({ error: 'not_found' });

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

    const customer = await prisma.customer.findUnique({ where: { token }, select: { id: true } });
    if (!customer) return reply.code(404).send({ error: 'not_found' });

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
