import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';

function periodStart(period?: string): Date {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const FUNNEL = ['combo_show', 'combo_preview', 'combo_click', 'add_to_cart'];

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/analytics')) await app.authGuard(req, reply);
  });

  // Üst metrik kartları: toplamlar + huni oranları + cihaz dağılımı
  app.get('/api/analytics/overview', async (req) => {
    const { period } = req.query as { period?: string };
    const since = periodStart(period);

    const rows = await prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      where: { customerId: req.customerId, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.eventType] = r._count._all;

    const devices = await prisma.analyticsEvent.groupBy({
      by: ['deviceType'],
      where: { customerId: req.customerId, createdAt: { gte: since } },
      _count: { _all: true },
    });

    const shows = counts['combo_show'] || 0;
    const previews = counts['combo_preview'] || 0;
    const clicks = counts['combo_click'] || 0;
    const carts = counts['add_to_cart'] || 0;
    const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

    return {
      period: period || '30d',
      counts,
      funnel: FUNNEL.map((step) => ({ step, count: counts[step] || 0 })),
      rates: {
        previewRate: rate(previews, shows),
        clickRate: rate(clicks, previews),
        cartRate: rate(carts, clicks),
      },
      devices: devices.map((d) => ({ device: d.deviceType || 'desktop', count: d._count._all })),
    };
  });

  // Kombin bazlı performans tablosu
  app.get('/api/analytics/combos', async (req) => {
    const { period } = req.query as { period?: string };
    const since = periodStart(period);

    const combos = await prisma.combo.findMany({
      where: { customerId: req.customerId },
      select: { id: true, suggestedProductName: true, mascotText: true, isActive: true },
    });
    const rows = await prisma.analyticsEvent.groupBy({
      by: ['comboId', 'eventType'],
      where: { customerId: req.customerId, comboId: { not: null }, createdAt: { gte: since } },
      _count: { _all: true },
    });

    const byCombo: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!r.comboId) continue;
      byCombo[r.comboId] = byCombo[r.comboId] || {};
      byCombo[r.comboId][r.eventType] = r._count._all;
    }

    return combos.map((c) => {
      const e = byCombo[c.id] || {};
      const shows = e['combo_show'] || 0;
      const carts = e['add_to_cart'] || 0;
      return {
        id: c.id,
        name: c.suggestedProductName,
        mascotText: c.mascotText,
        isActive: c.isActive,
        shows,
        previews: e['combo_preview'] || 0,
        clicks: e['combo_click'] || 0,
        carts,
        conversion: shows > 0 ? Math.round((carts / shows) * 1000) / 10 : 0,
      };
    });
  });

  // Saatlik dağılım — heatmap verisi: gün (0=Pzt) × saat (0-23) matrisi
  app.get('/api/analytics/hourly', async (req) => {
    const { period, metric } = req.query as { period?: string; metric?: string };
    const since = periodStart(period);
    const eventType = metric && /^[a-z][a-z0-9_]{2,39}$/.test(metric) ? metric : 'combo_click';

    const events = await prisma.analyticsEvent.findMany({
      where: { customerId: req.customerId, eventType, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    // 7×24 matris; JS getDay() Pazar=0 → Pazartesi=0'a çevrilir
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const e of events) {
      const day = (e.createdAt.getDay() + 6) % 7;
      matrix[day][e.createdAt.getHours()] += 1;
    }
    return { metric: eventType, matrix };
  });

  // Tahmini ek gelir: attribution'lı sepete eklemeler × ortalama sepet değeri
  app.get('/api/analytics/revenue', async (req) => {
    const { period, avgBasket } = req.query as { period?: string; avgBasket?: string };
    const since = periodStart(period);
    const basket = Math.max(0, Number(avgBasket) || 1500);

    const carts = await prisma.analyticsEvent.count({
      where: { customerId: req.customerId, eventType: 'add_to_cart', createdAt: { gte: since } },
    });
    return {
      period: period || '30d',
      attributedCarts: carts,
      avgBasketValue: basket,
      estimatedRevenue: carts * basket,
    };
  });

  // CSV dışa aktarma — ham event listesi
  app.get('/api/analytics/export.csv', async (req, reply) => {
    const { period } = req.query as { period?: string };
    const since = periodStart(period);

    const events = await prisma.analyticsEvent.findMany({
      where: { customerId: req.customerId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
      select: { createdAt: true, eventType: true, comboId: true, sessionId: true, pageUrl: true, deviceType: true },
    });

    const esc = (v: string | null) => (v === null ? '' : '"' + String(v).replace(/"/g, '""') + '"');
    const rows = ['createdAt,eventType,comboId,sessionId,pageUrl,deviceType'];
    for (const e of events) {
      rows.push([
        e.createdAt.toISOString(), e.eventType, esc(e.comboId), esc(e.sessionId), esc(e.pageUrl), esc(e.deviceType),
      ].join(','));
    }
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="triko-analytics-' + (period || '30d') + '.csv"')
      .send(rows.join('\n'));
  });

  // Günlük zaman serisi (varsayılan metrik: combo_show)
  app.get('/api/analytics/timeseries', async (req) => {
    const { period, metric } = req.query as { period?: string; metric?: string };
    const since = periodStart(period);
    const eventType = metric && /^[a-z][a-z0-9_]{2,39}$/.test(metric) ? metric : 'combo_show';

    const events = await prisma.analyticsEvent.findMany({
      where: { customerId: req.customerId, eventType, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const byDay: Record<string, number> = {};
    for (const e of events) {
      const day = e.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }

    const out: { date: string; count: number }[] = [];
    for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      out.push({ date: day, count: byDay[day] || 0 });
    }
    return { metric: eventType, points: out };
  });
}
