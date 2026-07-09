import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { cacheDel } from '../lib/cache';

type SettingsBody = {
  imageUrl?: string | null;
  primaryColor?: string;
  mascotName?: string;
  sizeDesktop?: number;
  sizeMobile?: number;
  proactiveDelayMs?: number;
  proactiveIntervalMs?: number;
  proximityThresholdPx?: number;
  maxDailyShows?: number;
  mobileEnabled?: boolean;
  noGoSelectors?: string[];
};

function serialize(s: { noGoSelectors: string } & Record<string, unknown>) {
  return { ...s, noGoSelectors: JSON.parse(s.noGoSelectors) as string[] };
}

export async function mascotRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/mascot')) await app.authGuard(req, reply);
  });

  app.get('/api/mascot/settings', async (req) => {
    const s = await prisma.mascotSettings.upsert({
      where: { customerId: req.customerId },
      update: {},
      create: { customerId: req.customerId },
    });
    return serialize(s);
  });

  app.put('/api/mascot/settings', async (req, reply) => {
    const b = (req.body || {}) as SettingsBody;
    if (b.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(b.primaryColor)) {
      return reply.code(400).send({ error: 'invalid_primary_color' });
    }
    if (b.mascotName !== undefined && (b.mascotName.length < 1 || b.mascotName.length > 24)) {
      return reply.code(400).send({ error: 'mascot_name_1_24_chars' });
    }

    const data: Record<string, unknown> = {};
    for (const key of [
      'imageUrl', 'primaryColor', 'mascotName', 'sizeDesktop', 'sizeMobile',
      'proactiveDelayMs', 'proactiveIntervalMs', 'proximityThresholdPx',
      'maxDailyShows', 'mobileEnabled',
    ] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    if (b.noGoSelectors !== undefined) data.noGoSelectors = JSON.stringify(b.noGoSelectors);

    const s = await prisma.mascotSettings.upsert({
      where: { customerId: req.customerId },
      update: data,
      create: { customerId: req.customerId, ...data },
    });

    const c = await prisma.customer.findUnique({ where: { id: req.customerId }, select: { token: true } });
    if (c) await cacheDel('wcfg:' + c.token);
    return serialize(s);
  });
}
