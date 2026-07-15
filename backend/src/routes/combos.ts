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
  suggestedProductImageProcessed?: string | null;
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

  // ?status=pending|published ile filtrelenebilir (Onay Kuyruğu pending'i çeker)
  app.get('/api/combos', async (req) => {
    const { status } = req.query as { status?: string };
    return prisma.combo.findMany({
      where: {
        customerId: req.customerId,
        ...(status === 'pending' || status === 'published' ? { status } : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  });

  // Sidebar rozeti: onay bekleyen kombin sayısı
  app.get('/api/combos/pending-count', async (req) => {
    const count = await prisma.combo.count({
      where: { customerId: req.customerId, status: 'pending' },
    });
    return { count };
  });

  // Toplu işlem — Onay Kuyruğu ve Kombinler sayfasındaki çoklu seçim.
  // publish: pending → published (widget'a çıkar); delete: analitiğiyle siler.
  app.post('/api/combos/bulk', async (req, reply) => {
    const b = (req.body || {}) as { action?: string; ids?: unknown };
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
    const action = b.action;
    if (!ids.length || !action) return reply.code(400).send({ error: 'action_and_ids_required' });
    if (!['publish', 'activate', 'deactivate', 'delete'].includes(action)) {
      return reply.code(400).send({ error: 'invalid_action' });
    }

    // Sadece bu müşteriye ait id'ler işlenir (kiracı izolasyonu)
    const owned = await prisma.combo.findMany({
      where: { id: { in: ids }, customerId: req.customerId },
      select: { id: true },
    });
    const ownedIds = owned.map((c) => c.id);
    if (!ownedIds.length) return { ok: true, affected: 0 };

    let affected = 0;
    switch (action) {
      case 'publish': {
        const r = await prisma.combo.updateMany({
          where: { id: { in: ownedIds } },
          data: { status: 'published', isActive: true },
        });
        affected = r.count;
        break;
      }
      case 'activate':
      case 'deactivate': {
        // Aktifleştir = onayla + yayınla: pending kombin de canlıya çıksın.
        // Pasifleştir yalnız isActive'i düşürür, yayın durumunu korur.
        const r = await prisma.combo.updateMany({
          where: { id: { in: ownedIds } },
          data: action === 'activate' ? { isActive: true, status: 'published' } : { isActive: false },
        });
        affected = r.count;
        break;
      }
      case 'delete': {
        await prisma.analyticsEvent.deleteMany({ where: { comboId: { in: ownedIds } } });
        const r = await prisma.combo.deleteMany({ where: { id: { in: ownedIds } } });
        affected = r.count;
        break;
      }
      default:
        return reply.code(400).send({ error: 'invalid_action' });
    }
    await invalidateWidgetCache(req.customerId);
    return { ok: true, affected };
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
        suggestedProductImageProcessed: b.suggestedProductImageProcessed ?? null,
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
        suggestedProductImageProcessed:
          b.suggestedProductImageProcessed !== undefined ? b.suggestedProductImageProcessed : existing.suggestedProductImageProcessed,
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
