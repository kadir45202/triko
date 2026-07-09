import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { cacheDel } from '../lib/cache';
import { MAX_IMAGE_BYTES, removeBackground, saveImage } from '../lib/storage';

async function readImagePart(req: { file: () => Promise<any> }) {
  const part = await req.file();
  if (!part) throw new Error('file_required');
  const buf: Buffer = await part.toBuffer();
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('file_too_large');
  return { buf, mime: String(part.mimetype || '') };
}

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/mascot/upload-image') || req.url.startsWith('/api/combos/upload-image')) {
      await app.authGuard(req, reply);
    }
  });

  // Maskot görseli: yükle → arkaplan sil → ayarlara yaz
  app.post('/api/mascot/upload-image', async (req, reply) => {
    try {
      const { buf, mime } = await readImagePart(req as never);
      const original = await saveImage(buf, mime, 'mascot');
      const processed = await removeBackground(buf, mime, 'mascot');
      const s = await prisma.mascotSettings.upsert({
        where: { customerId: req.customerId },
        update: { imageUrl: processed },
        create: { customerId: req.customerId, imageUrl: processed },
      });
      const c = await prisma.customer.findUnique({ where: { id: req.customerId }, select: { token: true } });
      if (c) await cacheDel('wcfg:' + c.token);
      return { imageUrl: s.imageUrl, originalUrl: original };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Kombin ürün görseli: yükle → arkaplan sil → URL'leri döndür
  // (dönen URL'ler kombin formunda suggestedProductImage* alanlarına yazılır)
  app.post('/api/combos/upload-image', async (req, reply) => {
    try {
      const { buf, mime } = await readImagePart(req as never);
      const original = await saveImage(buf, mime, 'combo');
      const processed = await removeBackground(buf, mime, 'combo');
      return { originalUrl: original, processedUrl: processed };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
}
