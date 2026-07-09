import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { verifyPassword } from '../lib/password';

function issueTokens(app: FastifyInstance, customerId: string) {
  return {
    accessToken: app.jwt.sign({ sub: customerId, typ: 'access' }, { expiresIn: '15m' }),
    refreshToken: app.jwt.sign({ sub: customerId, typ: 'refresh' }, { expiresIn: '7d' }),
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = (req.body || {}) as { email?: string; password?: string };
    if (!email || !password) return reply.code(400).send({ error: 'email_and_password_required' });

    const customer = await prisma.customer.findUnique({ where: { email } });
    if (!customer || !verifyPassword(password, customer.passwordHash)) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    return {
      ...issueTokens(app, customer.id),
      customer: { id: customer.id, email: customer.email, companyName: customer.companyName, plan: customer.plan },
    };
  });

  app.post('/api/auth/refresh', async (req, reply) => {
    const { refreshToken } = (req.body || {}) as { refreshToken?: string };
    if (!refreshToken) return reply.code(400).send({ error: 'refresh_token_required' });
    try {
      const payload = app.jwt.verify<{ sub: string; typ: string }>(refreshToken);
      if (payload.typ !== 'refresh') throw new Error('wrong type');
      return issueTokens(app, payload.sub);
    } catch {
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }
  });

  // JWT durumsuz olduğu için logout istemci tarafında token'ları silmekten ibaret;
  // uç, panelin akışı için sözleşme gereği var.
  app.post('/api/auth/logout', async () => ({ ok: true }));
}
