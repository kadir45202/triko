// Backend API testleri (Faz 7) — node:test + fastify inject, ayrı SQLite DB.
// Çalıştırma: npm test  (DATABASE_URL=file:./test.db ile db push + seed'siz)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { ruleBasedRecommend } from '../src/lib/recommend';

let app: FastifyInstance;
let accessToken: string;

const EMAIL = 'test@triko.app';
const PASSWORD = 'test-parola-1';
const TOKEN = 'test-token';

before(async () => {
  app = buildApp();
  await app.ready();

  await prisma.analyticsEvent.deleteMany({});
  await prisma.combo.deleteMany({});
  await prisma.mascotSettings.deleteMany({});
  await prisma.customer.deleteMany({});

  await prisma.customer.create({
    data: {
      email: EMAIL,
      passwordHash: hashPassword(PASSWORD),
      companyName: 'Test AŞ',
      token: TOKEN,
      mascotSettings: { create: {} },
    },
  });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('login: doğru parola token verir, yanlış parola 401', async () => {
  const ok = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: EMAIL, password: PASSWORD },
  });
  assert.equal(ok.statusCode, 200);
  accessToken = ok.json().accessToken;
  assert.ok(accessToken);

  const bad = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: EMAIL, password: 'yanlis' },
  });
  assert.equal(bad.statusCode, 401);
});

test('yetkisiz istek 401 döner', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/combos' });
  assert.equal(res.statusCode, 401);
});

test('kombin CRUD + cache invalidation', async () => {
  const auth = { authorization: 'Bearer ' + accessToken };

  // Widget config'i cache'e al
  const cfg1 = await app.inject({ method: 'GET', url: '/api/widget/config?token=' + TOKEN });
  assert.equal(cfg1.statusCode, 200);
  assert.equal(cfg1.json().combos.length, 0);
  const cfg2 = await app.inject({ method: 'GET', url: '/api/widget/config?token=' + TOKEN });
  assert.equal(cfg2.headers['x-cache'], 'hit');

  // Kombin oluştur → cache düşmeli, yeni config kombini içermeli
  const created = await app.inject({
    method: 'POST', url: '/api/combos', headers: auth,
    payload: { triggerUrlPattern: 'urun', suggestedProductName: 'Test Ürün', mascotText: 'dene' },
  });
  assert.equal(created.statusCode, 201);
  const comboId = created.json().id;

  const cfg3 = await app.inject({ method: 'GET', url: '/api/widget/config?token=' + TOKEN });
  assert.equal(cfg3.headers['x-cache'], 'miss'); // invalidation çalıştı
  assert.equal(cfg3.json().combos.length, 1);

  // Toggle → pasif kombin config'te görünmez
  await app.inject({ method: 'PATCH', url: '/api/combos/' + comboId + '/toggle', headers: auth });
  const cfg4 = await app.inject({ method: 'GET', url: '/api/widget/config?token=' + TOKEN });
  assert.equal(cfg4.json().combos.length, 0);

  await app.inject({ method: 'DELETE', url: '/api/combos/' + comboId, headers: auth });
  const list = await app.inject({ method: 'GET', url: '/api/combos', headers: auth });
  assert.equal(list.json().length, 0);
});

test('event deduplication: aynı oturumda aynı event çift sayılmaz', async () => {
  const payload = {
    token: TOKEN, eventType: 'combo_show', sessionId: 'dedup-s1', pageUrl: '/p1',
  };
  const first = await app.inject({ method: 'POST', url: '/api/widget/event', payload });
  assert.equal(first.statusCode, 200);
  assert.notEqual(first.json().deduped, true);

  const second = await app.inject({ method: 'POST', url: '/api/widget/event', payload });
  assert.equal(second.json().deduped, true);

  const count = await prisma.analyticsEvent.count({ where: { sessionId: 'dedup-s1' } });
  assert.equal(count, 1);
});

test('rate limit: 100/dk aşılınca 429', async () => {
  // Ayrı token'lı müşteri — diğer testlerin limitini kirletmesin
  await prisma.customer.create({
    data: {
      email: 'rl@triko.app', passwordHash: hashPassword('x-parola-1'),
      companyName: 'RL', token: 'rl-token',
    },
  });
  let lastStatus = 0;
  for (let i = 0; i <= 100; i++) {
    const res = await app.inject({
      method: 'POST', url: '/api/widget/event',
      payload: { token: 'rl-token', eventType: 'combo_show', sessionId: 'rl-' + i, pageUrl: '/p' + i },
    });
    lastStatus = res.statusCode;
  }
  assert.equal(lastStatus, 429);
});

test('domain doğrulama: kayıtlı domain varken yabancı origin 403', async () => {
  await prisma.customer.create({
    data: {
      email: 'dom@triko.app', passwordHash: hashPassword('x-parola-1'),
      companyName: 'Dom', token: 'dom-token', allowedDomains: JSON.stringify(['magaza.com']),
    },
  });

  const denied = await app.inject({
    method: 'GET', url: '/api/widget/config?token=dom-token',
    headers: { origin: 'https://kotu-site.com' },
  });
  assert.equal(denied.statusCode, 403);

  const allowed = await app.inject({
    method: 'GET', url: '/api/widget/config?token=dom-token',
    headers: { origin: 'https://www.magaza.com' },
  });
  assert.equal(allowed.statusCode, 200);
});

test('analitik hesaplamaları: huni sayıları ve oranlar doğru', async () => {
  const auth = { authorization: 'Bearer ' + accessToken };
  const me = await prisma.customer.findUnique({ where: { email: EMAIL } });

  await prisma.analyticsEvent.deleteMany({ where: { customerId: me!.id } });
  const mk = (eventType: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      customerId: me!.id, eventType, sessionId: 'an-' + eventType + '-' + i,
      pageUrl: '/p', deviceType: i % 2 ? 'mobile' : 'desktop',
    }));
  await prisma.analyticsEvent.createMany({
    data: [...mk('combo_show', 10), ...mk('combo_preview', 5), ...mk('combo_click', 2), ...mk('add_to_cart', 1)],
  });

  const res = await app.inject({ method: 'GET', url: '/api/analytics/overview?period=7d', headers: auth });
  const body = res.json();
  assert.equal(body.counts['combo_show'], 10);
  assert.equal(body.rates.previewRate, 50);   // 5/10
  assert.equal(body.rates.clickRate, 40);     // 2/5
  assert.equal(body.rates.cartRate, 50);      // 1/2

  const rev = await app.inject({ method: 'GET', url: '/api/analytics/revenue?period=7d&avgBasket=1000', headers: auth });
  assert.equal(rev.json().estimatedRevenue, 1000); // 1 sepet × 1000

  const csv = await app.inject({ method: 'GET', url: '/api/analytics/export.csv?period=7d', headers: auth });
  assert.equal(csv.statusCode, 200);
  assert.ok(csv.headers['content-type']?.toString().includes('text/csv'));
  assert.equal(csv.body.trim().split('\n').length, 19); // başlık + 18 event
});

test('kural bazlı öneri motoru: bakılan ürünler önerilmez, kategori başına max 2', () => {
  const viewed = [
    { id: 'a', name: 'A', category: 'kadin', color: 'siyah', price: 1000 },
    { id: 'b', name: 'B', category: 'kadin', color: 'siyah', price: 1200 },
    { id: 'c', name: 'C', category: 'kadin', color: 'siyah', price: 900 },
  ];
  const catalog = [
    ...viewed,
    { id: 'd', name: 'D', category: 'kadin', color: 'siyah', price: 1100 },
    { id: 'e', name: 'E', category: 'kadin', color: 'siyah', price: 1000 },
    { id: 'f', name: 'F', category: 'kadin', color: 'siyah', price: 950 },
    { id: 'g', name: 'G', category: 'erkek', color: 'siyah', price: 1050 },
  ];
  const recs = ruleBasedRecommend(viewed, catalog);
  assert.ok(recs.length >= 3 && recs.length <= 4);
  assert.ok(!recs.some((r) => ['a', 'b', 'c'].includes(r.productId)));
  const kadinCount = recs.filter((r) => ['d', 'e', 'f'].includes(r.productId)).length;
  assert.ok(kadinCount <= 2, 'kategori başına en fazla 2 öneri');
});
