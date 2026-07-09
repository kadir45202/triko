import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MAX_IMAGE_BYTES, UPLOAD_DIR } from './lib/storage';
import { uploadRoutes } from './routes/uploads';
import { authRoutes } from './routes/auth';
import { widgetRoutes } from './routes/widget';
import { comboRoutes } from './routes/combos';
import { mascotRoutes } from './routes/mascot';
import { analyticsRoutes } from './routes/analytics';
import { accountRoutes } from './routes/account';

declare module 'fastify' {
  interface FastifyRequest {
    customerId: string;
  }
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(jwt, { secret: process.env.JWT_SECRET || 'gelistirme-anahtari' });
  app.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

  // Yüklenen görseller — üretimde S3/CDN'e taşınır, arayüz aynı kalır
  mkdirSync(UPLOAD_DIR, { recursive: true });
  app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    cacheControl: true,
    maxAge: '7d',
    immutable: true,
  });

  // Widget dağıtımı: üretimde Cloudflare CDN'in origin'i bu uçtur
  app.get('/cdn/widget.js', async (_req, reply) => {
    const widgetPath = join(__dirname, '..', '..', 'widget', 'widget.js');
    try {
      const js = readFileSync(widgetPath, 'utf8');
      return reply
        .header('content-type', 'application/javascript; charset=utf-8')
        .header('cache-control', 'public, max-age=300, s-maxage=86400')
        .send(js);
    } catch {
      return reply.code(404).send('// widget bulunamadı');
    }
  });

  app.decorateRequest('customerId', '');

  // Temel güvenlik başlıkları
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  // Panel uçları için JWT koruması: access token'ı doğrular, customerId'yi request'e koyar
  app.decorate('authGuard', async function (req: FastifyRequest, reply: FastifyReply) {
    try {
      const payload = await req.jwtVerify<{ sub: string; typ: string }>();
      if (payload.typ !== 'access') throw new Error('wrong token type');
      req.customerId = payload.sub;
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/api/health', async () => ({ ok: true, service: 'triko-backend' }));

  app.register(authRoutes);
  app.register(uploadRoutes);
  app.register(widgetRoutes);
  app.register(comboRoutes);
  app.register(mascotRoutes);
  app.register(analyticsRoutes);
  app.register(accountRoutes);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    authGuard: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
