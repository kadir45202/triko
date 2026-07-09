import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
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

  app.decorateRequest('customerId', '');

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
