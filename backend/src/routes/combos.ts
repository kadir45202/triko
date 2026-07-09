import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { cacheDel } from '../lib/cache';

type ComboBody = {
  triggerUrlPattern?: string;
  triggerProductId?: string | null;
  suggestedProductName?: string;
  suggestedProductPrice?: string;
  suggestedProductUrl?: string;
  suggestedProductImageOriginal?: string | null;
  mascotText?: string;
  socialProof?: string | null;
  expertNote?: string | null;
  priority?: number;
  isActive?: boolean;
};

async function invalidateWidgetCache(customerId: string) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { token: true } });
  if (c) await cacheDel('wcfg:' + c.token);
}

export async function comboRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/combos')) await app.authGuard(req, reply);
  });

  app.get('/api/combos', async (req) => {
    return prisma.combo.findMany({
      where: { customerId: req.customerId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  });

  app.post('/api/combos', async (req, reply) => {
    const b = (req.body || {}) as ComboBody;
    if (!b.triggerUrlPattern || !b.suggestedProductName || !b.mascotText) {
      return reply.code(400).send({ error: 'triggerUrlPattern_suggestedProductName_mascotText_required' });
    }
    if (b.mascotText.length > 80) return reply.code(400).send({ error: 'mascotText_max_80' });

    const combo = await prisma.combo.create({
      data: {
        customerId: req.customerId,
        triggerUrlPattern: b.triggerUrlPattern,
        triggerProductId: b.triggerProductId ?? null,
        suggestedProductName: b.suggestedProductName,
        suggestedProductPrice: b.suggestedProductPrice ?? '',
        suggestedProductUrl: b.suggestedProductUrl ?? '',
        suggestedProductImageOriginal: b.suggestedProductImageOriginal ?? null,
        mascotText: b.mascotText,
        socialProof: b.socialProof ?? null,
        expertNote: b.expertNote ?? null,
        priority: b.priority ?? 0,
        isActive: b.isActive ?? true,
      },
    });
    await invalidateWidgetCache(req.customerId);
    return reply.code(201).send(combo);
  });

  app.get('/api/combos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const combo = await prisma.combo.findFirst({ where: { id, customerId: req.customerId } });
    if (!combo) return reply.code(404).send({ error: 'not_found' });
    return combo;
  });

  app.put('/api/combos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.combo.findFirst({ where: { id, customerId: req.customerId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const b = (req.body || {}) as ComboBody;
    if (b.mascotText && b.mascotText.length > 80) return reply.code(400).send({ error: 'mascotText_max_80' });

    const combo = await prisma.combo.update({
      where: { id },
      data: {
        triggerUrlPattern: b.triggerUrlPattern ?? existing.triggerUrlPattern,
        triggerProductId: b.triggerProductId !== undefined ? b.triggerProductId : existing.triggerProductId,
        suggestedProductName: b.suggestedProductName ?? existing.suggestedProductName,
        suggestedProductPrice: b.suggestedProductPrice ?? existing.suggestedProductPrice,
        suggestedProductUrl: b.suggestedProductUrl ?? existing.suggestedProductUrl,
        suggestedProductImageOriginal:
          b.suggestedProductImageOriginal !== undefined ? b.suggestedProductImageOriginal : existing.suggestedProductImageOriginal,
        mascotText: b.mascotText ?? existing.mascotText,
        socialProof: b.socialProof !== undefined ? b.socialProof : existing.socialProof,
        expertNote: b.expertNote !== undefined ? b.expertNote : existing.expertNote,
        priority: b.priority ?? existing.priority,
        isActive: b.isActive ?? existing.isActive,
      },
    });
    await invalidateWidgetCache(req.customerId);
    return combo;
  });

  app.delete('/api/combos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.combo.findFirst({ where: { id, customerId: req.customerId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    await prisma.analyticsEvent.deleteMany({ where: { comboId: id } });
    await prisma.combo.delete({ where: { id } });
    await invalidateWidgetCache(req.customerId);
    return { ok: true };
  });

  app.patch('/api/combos/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.combo.findFirst({ where: { id, customerId: req.customerId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const combo = await prisma.combo.update({ where: { id }, data: { isActive: !existing.isActive } });
    await invalidateWidgetCache(req.customerId);
    return combo;
  });
}
