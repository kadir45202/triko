// Plan/limit katmanı testleri (#7): saf limit mantığı + tarama günlük limiti,
// ürün kotası (ingest) ve /api/account/plan kullanım göstergesi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { effectivePlan, isPlanActive, planLimits, PLAN_LIMITS } from '../src/lib/plan';

const EMAIL = 'plan-test@triko.app';
const TOKEN = 'plan-test-token';

let app: FastifyInstance;
let customerId: string;
let auth: { authorization: string };

before(async () => {
  app = buildApp();
  await app.ready();

  await prisma.scanRun.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.customer.deleteMany({ where: { email: EMAIL } });

  const c = await prisma.customer.create({
    data: {
      email: EMAIL,
      passwordHash: hashPassword('parola'),
      companyName: 'Plan Test AŞ',
      token: TOKEN,
      plan: 'STARTER',
    },
  });
  customerId = c.id;

  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: EMAIL, password: 'parola' } });
  auth = { authorization: 'Bearer ' + login.json().accessToken };
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

// ---------- saf limit mantığı ----------

test('isPlanActive: süresiz/geçerli/aktif değil', () => {
  assert.equal(isPlanActive({ plan: 'GROWTH', planExpiresAt: null }), true);
  assert.equal(isPlanActive({ plan: 'GROWTH', planExpiresAt: new Date(Date.now() + 86400_000) }), true);
  assert.equal(isPlanActive({ plan: 'GROWTH', planExpiresAt: new Date(Date.now() - 1000) }), false);
});

test('effectivePlan: süresi dolan plan STARTER\'a düşer, bilinmeyen ad STARTER', () => {
  assert.equal(effectivePlan({ plan: 'GROWTH', planExpiresAt: null }), 'GROWTH');
  assert.equal(effectivePlan({ plan: 'ENTERPRISE', planExpiresAt: new Date(Date.now() + 1000) }), 'ENTERPRISE');
  assert.equal(effectivePlan({ plan: 'GROWTH', planExpiresAt: new Date(Date.now() - 1000) }), 'STARTER'); // süresi dolmuş
  assert.equal(effectivePlan({ plan: 'PRO_XL', planExpiresAt: null }), 'STARTER'); // bilinmeyen
  assert.equal(planLimits({ plan: 'STARTER', planExpiresAt: null }).maxProducts, PLAN_LIMITS.STARTER.maxProducts);
});

// ---------- tarama günlük limiti ----------

test('scan: STARTER günlük tarama limiti aşılınca 429 plan_scan_limit', async () => {
  await prisma.scanRun.deleteMany({ where: { customerId } });
  // STARTER günlük limit = 3; bugün 3 koşu oluştur
  for (let i = 0; i < PLAN_LIMITS.STARTER.maxScansPerDay; i++) {
    await prisma.scanRun.create({
      data: { customerId, siteUrl: 'https://plan.test', trigger: 'manual', state: 'done', startedAt: new Date() },
    });
  }
  const r = await app.inject({
    method: 'POST', url: '/api/catalog/scan', headers: auth,
    payload: { siteUrl: 'https://plan.test' },
  });
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'plan_scan_limit');
  assert.equal(r.json().limit, PLAN_LIMITS.STARTER.maxScansPerDay);
});

// ---------- ürün kotası (pasif ingest) ----------

test('ingest: ürün kotası dolunca yeni ürün eklenmez (capped)', async () => {
  await prisma.product.deleteMany({ where: { customerId } });
  const cap = PLAN_LIMITS.STARTER.maxProducts;
  await prisma.product.createMany({
    data: Array.from({ length: cap }, (_, i) => ({
      customerId, externalId: 'cap-' + i, url: 'https://plan.test/u/' + i,
      name: 'Ürün ' + i, status: 'active',
    })),
  });

  const r = await app.inject({
    method: 'POST', url: '/api/widget/ingest',
    payload: { token: TOKEN, product: { id: 'yeni-1', url: 'https://plan.test/u/yeni-1', name: 'Kota Üstü Ürün' } },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().capped, true);
  // kota üstü ürün DB'ye yazılmadı
  const stored = await prisma.product.findUnique({ where: { customerId_externalId: { customerId, externalId: 'yeni-1' } } });
  assert.equal(stored, null);
  assert.equal(await prisma.product.count({ where: { customerId } }), cap);
});

// ---------- kullanım göstergesi ----------

test('GET /api/account/plan: efektif plan + limit + kullanım döner', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/account/plan', headers: auth });
  assert.equal(r.statusCode, 200);
  const b = r.json();
  assert.equal(b.effectivePlan, 'STARTER');
  assert.equal(b.active, true);
  assert.equal(b.limits.maxProducts, PLAN_LIMITS.STARTER.maxProducts);
  assert.equal(b.usage.productsLimit, PLAN_LIMITS.STARTER.maxProducts);
  assert.equal(typeof b.usage.products, 'number');
  assert.equal(typeof b.usage.scansToday, 'number');
});
