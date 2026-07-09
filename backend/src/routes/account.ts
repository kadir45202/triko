import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';

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
}
