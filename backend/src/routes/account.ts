import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { effectivePlan, isPlanActive, planLimits } from '../lib/plan';

export async function accountRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/account')) await app.authGuard(req, reply);
  });

  app.get('/api/account', async (req, reply) => {
    const c = await prisma.customer.findUnique({
      where: { id: req.customerId },
      select: { id: true, email: true, companyName: true, token: true, plan: true, planExpiresAt: true, createdAt: true },
    });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    return c;
  });

  app.put('/api/account', async (req, reply) => {
    const { companyName } = (req.body || {}) as { companyName?: string };
    if (!companyName || companyName.length < 2) return reply.code(400).send({ error: 'company_name_required' });
    const c = await prisma.customer.update({
      where: { id: req.customerId },
      data: { companyName },
      select: { id: true, email: true, companyName: true, plan: true },
    });
    return c;
  });

  app.get('/api/account/subscription', async (req, reply) => {
    const c = await prisma.customer.findUnique({
      where: { id: req.customerId },
      select: { plan: true, planExpiresAt: true },
    });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    return c;
  });

  // Plan + limitler + anlık kullanım (#7) — panelde "84/100 ürün" göstergesi için
  app.get('/api/account/plan', async (req, reply) => {
    const c = await prisma.customer.findUnique({
      where: { id: req.customerId },
      select: { plan: true, planExpiresAt: true },
    });
    if (!c) return reply.code(404).send({ error: 'not_found' });

    const limits = planLimits(c);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [activeProducts, scansToday] = await Promise.all([
      prisma.product.count({ where: { customerId: req.customerId, status: 'active' } }),
      prisma.scanRun.count({ where: { customerId: req.customerId, startedAt: { gte: startOfDay } } }),
    ]);

    return {
      plan: c.plan,
      effectivePlan: effectivePlan(c),
      active: isPlanActive(c),
      planExpiresAt: c.planExpiresAt,
      limits,
      usage: {
        products: activeProducts,
        productsLimit: limits.maxProducts,
        scansToday,
        scansPerDayLimit: limits.maxScansPerDay,
      },
    };
  });
}
