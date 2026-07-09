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
