// Onay kuyruğu testleri: autoPublish kapalıyken ajan kombinleri pending düşer
// ve widget'a çıkmaz; toplu uçlar kiracı izolasyonuna uyar; tarama geçmişi
// ve sağlık ucu doğru hesaplar. api/agent testleriyle aynı test.db kurulumu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { generateCombos, latestScanStatus, recoverStuckScans } from '../src/lib/agent';

let app: FastifyInstance;
let customerId: string;
let otherCustomerId: string;
let auth: { authorization: string };

const EMAIL = 'queue-test@triko.app';
const OTHER_EMAIL = 'queue-other@triko.app';
const TOKEN = 'queue-test-token';
const PAGE = 'https://kuyruk.test/urun?id=q-base';

before(async () => {
  app = buildApp();
  await app.ready();

  await prisma.scanRun.deleteMany({});
  await prisma.agentEvent.deleteMany({});
  await prisma.analyticsEvent.deleteMany({});
  await prisma.combo.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.mascotSettings.deleteMany({});
  await prisma.customer.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });

  const c = await prisma.customer.create({
    data: {
      email: EMAIL,
      passwordHash: hashPassword('parola'),
      companyName: 'Kuyruk Test AŞ',
      token: TOKEN,
      autoPublishCombos: false, // onay kuyruğu senaryosu
    },
  });
  customerId = c.id;

  const other = await prisma.customer.create({
    data: {
      email: OTHER_EMAIL,
      passwordHash: hashPassword('parola'),
      companyName: 'Diğer AŞ',
      token: 'queue-other-token',
    },
  });
  otherCustomerId = other.id;

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: EMAIL, password: 'parola' },
  });
  auth = { authorization: 'Bearer ' + login.json().accessToken };

  // Tamamlayıcı iki ürün → ajan en az bir kombin kurar
  await prisma.product.createMany({
    data: [
      {
        customerId, externalId: 'q-base', url: PAGE,
        name: 'Üst', category: 'ust-giyim', color: 'siyah',
        styleTags: '["casual"]', enriched: true,
      },
      {
        customerId, externalId: 'q-suggest', url: 'https://kuyruk.test/urun?id=q-suggest',
        name: 'Alt', category: 'alt-giyim', color: 'siyah',
        styleTags: '["casual"]', enriched: true,
      },
    ],
  });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('autoPublish kapalı: ajan kombini pending düşer, widget config\'e çıkmaz', async () => {
  const created = await generateCombos(customerId);
  assert.ok(created >= 1);

  const pending = await prisma.combo.findMany({ where: { customerId, status: 'pending' } });
  assert.ok(pending.length >= 1);
  assert.equal(pending[0].source, 'agent');

  const cfg = await app.inject({
    method: 'GET',
    url: '/api/widget/config?token=' + TOKEN + '&url=' + encodeURIComponent(PAGE),
  });
  assert.equal(cfg.statusCode, 200);
  assert.equal(cfg.json().combos.length, 0); // onaysız kombin yayına çıkmadı
});

test('pending-count ve ?status=pending filtresi bekleyenleri döner', async () => {
  const count = await app.inject({ method: 'GET', url: '/api/combos/pending-count', headers: auth });
  assert.equal(count.statusCode, 200);
  assert.ok(count.json().count >= 1);

  const list = await app.inject({ method: 'GET', url: '/api/combos?status=pending', headers: auth });
  assert.ok(list.json().every((c: { status: string }) => c.status === 'pending'));
});

test('bulk publish: pending → published, widget config\'e düşer (cache temizlenir)', async () => {
  const pending = await prisma.combo.findMany({ where: { customerId, status: 'pending' } });
  const r = await app.inject({
    method: 'POST',
    url: '/api/combos/bulk',
    headers: auth,
    payload: { action: 'publish', ids: pending.map((c) => c.id) },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().affected, pending.length);

  const cfg = await app.inject({
    method: 'GET',
    url: '/api/widget/config?token=' + TOKEN + '&url=' + encodeURIComponent(PAGE),
  });
  assert.ok(cfg.json().combos.length >= 1);
});

test('bulk: başka müşterinin kombinine dokunmaz (kiracı izolasyonu)', async () => {
  const foreign = await prisma.combo.create({
    data: {
      customerId: otherCustomerId,
      triggerUrlPattern: 'https://baska.test/',
      suggestedProductName: 'Yabancı Ürün',
      suggestedProductPrice: '₺100',
      suggestedProductUrl: 'https://baska.test/u',
      mascotText: 'Yabancı kombin',
    },
  });

  const r = await app.inject({
    method: 'POST',
    url: '/api/combos/bulk',
    headers: auth,
    payload: { action: 'delete', ids: [foreign.id] },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().affected, 0);
  assert.ok(await prisma.combo.findUnique({ where: { id: foreign.id } })); // hâlâ duruyor

  const bad = await app.inject({
    method: 'POST', url: '/api/combos/bulk', headers: auth,
    payload: { action: 'kötü', ids: [foreign.id] },
  });
  assert.equal(bad.statusCode, 400);
});

test('catalog/settings autoPublish ayarını değiştirir', async () => {
  const r = await app.inject({
    method: 'PUT', url: '/api/catalog/settings', headers: auth,
    payload: { autoPublishCombos: true },
  });
  assert.equal(r.statusCode, 200);

  const status = await app.inject({ method: 'GET', url: '/api/catalog/status', headers: auth });
  assert.equal(status.json().autoPublishCombos, true);

  const bad = await app.inject({
    method: 'PUT', url: '/api/catalog/settings', headers: auth,
    payload: { autoPublishCombos: 'evet' },
  });
  assert.equal(bad.statusCode, 400);
});

test('catalog/runs: geçmişi ve sağlığı döner, ardışık hatayı sayar', async () => {
  const base = Date.now();
  await prisma.scanRun.create({
    data: {
      customerId, siteUrl: 'https://kuyruk.test', trigger: 'manual', state: 'done',
      pagesScanned: 10, productsFound: 8, productsNew: 8, combosCreated: 4,
      startedAt: new Date(base - 3 * 3600_000), finishedAt: new Date(base - 3 * 3600_000 + 42_000),
    },
  });
  await prisma.scanRun.create({
    data: {
      customerId, siteUrl: 'https://kuyruk.test', trigger: 'scheduled', state: 'error',
      error: 'sitemap_not_found',
      startedAt: new Date(base - 3600_000), finishedAt: new Date(base - 3600_000 + 5_000),
    },
  });

  const r = await app.inject({ method: 'GET', url: '/api/catalog/runs', headers: auth });
  assert.equal(r.statusCode, 200);
  const body = r.json();
  assert.equal(body.runs.length, 2);
  assert.equal(body.runs[0].state, 'error'); // en yeni önce
  assert.equal(body.health.consecutiveFailures, 1);
  assert.equal(body.health.lastError, 'sitemap_not_found');
  assert.ok(body.health.lastSuccessAt);
  assert.ok(body.health.nextScheduledAt); // varsayılan 6 saatlik periyot
});

// ---- #4 dayanıklılık: DB-destekli durum + açılışta stale toparlama ----

test('latestScanStatus: bellek boşken son taramayı DB\'den döndürür (restart sonrası)', async () => {
  await prisma.scanRun.deleteMany({ where: { customerId } });
  await prisma.scanRun.create({
    data: {
      customerId, siteUrl: 'https://kuyruk.test', trigger: 'manual', state: 'done',
      pagesScanned: 12, productsFound: 9, productsNew: 5, combosCreated: 3,
      pages: JSON.stringify(['https://kuyruk.test/a', 'https://kuyruk.test/b']),
      startedAt: new Date(Date.now() - 60_000), finishedAt: new Date(),
    },
  });
  // Bu müşteri için bellekte canlı iş yok → DB'den map'lenmeli
  const st = await latestScanStatus(customerId);
  assert.ok(st);
  assert.equal(st!.state, 'done');
  assert.equal(st!.pagesScanned, 12);
  assert.equal(st!.productsNew, 5);
  assert.equal(st!.combosCreated, 3);
  assert.equal(st!.pages.length, 2);
});

test('recoverStuckScans: running kalmış taramaları interrupted_restart ile kapatır', async () => {
  await prisma.scanRun.deleteMany({ where: { customerId } });
  const stuck = await prisma.scanRun.create({
    data: { customerId, siteUrl: 'https://kuyruk.test', trigger: 'manual', state: 'running' },
  });
  const n = await recoverStuckScans();
  assert.ok(n >= 1);
  const after = await prisma.scanRun.findUnique({ where: { id: stuck.id } });
  assert.equal(after!.state, 'error');
  assert.equal(after!.error, 'interrupted_restart');
  assert.ok(after!.finishedAt);
  // toparlanınca durum artık 'running' göstermez
  const st = await latestScanStatus(customerId);
  assert.equal(st!.state, 'error');
});
