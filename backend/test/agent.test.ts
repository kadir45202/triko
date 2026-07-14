// Katalog ajanı testleri (Faz A/B) — crawler parser'ları, kural bazlı
// kombin üretimi ve ingest/scan uçları. api.test.ts ile aynı test.db kurulumu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { extractJsonLdProducts, externalIdFromUrl } from '../src/lib/crawler';
import { ruleBasedCombos, enrichPending, generateCombos } from '../src/lib/agent';

let app: FastifyInstance;
let customerId: string;

const EMAIL = 'agent-test@triko.app';
const TOKEN = 'agent-test-token';

before(async () => {
  app = buildApp();
  await app.ready();

  await prisma.agentEvent.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.analyticsEvent.deleteMany({});
  await prisma.combo.deleteMany({});
  await prisma.mascotSettings.deleteMany({});
  await prisma.customer.deleteMany({ where: { email: EMAIL } });

  const c = await prisma.customer.create({
    data: {
      email: EMAIL,
      passwordHash: hashPassword('parola'),
      companyName: 'Ajan Test AŞ',
      token: TOKEN,
    },
  });
  customerId = c.id;
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('JSON-LD parser Product düğümünü ve @graph içini bulur', () => {
  const html =
    '<html><head><script type="application/ld+json">' +
    JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'sayfa' },
        {
          '@type': 'Product', sku: 'p-1', name: 'Test Elbise',
          category: 'Kadın / Elbise', image: ['https://a.com/i.jpg'],
          offers: { '@type': 'Offer', price: '1.249', priceCurrency: 'TRY' },
        },
      ],
    }) +
    '</script></head><body></body></html>';
  const found = extractJsonLdProducts(html, 'https://a.com/urun?id=p-1');
  assert.equal(found.length, 1);
  assert.equal(found[0].externalId, 'p-1');
  assert.equal(found[0].name, 'Test Elbise');
  assert.equal(found[0].price, 1.249);
  assert.equal(found[0].imageUrl, 'https://a.com/i.jpg');
});

test('externalIdFromUrl query id > son path parçası', () => {
  assert.equal(externalIdFromUrl('https://a.com/urun.html?id=x-1'), 'x-1');
  assert.equal(externalIdFromUrl('https://a.com/p/deri-canta'), 'deri-canta');
});

test('kural bazlı kombin: tamamlayıcı kategori, base başına max 2', () => {
  const mk = (id: string, category: string, color: string) => ({
    id, externalId: id, url: 'https://a.com/' + id, name: id,
    price: 1000, imageUrl: null, category, color, styleTags: '["casual"]',
  });
  const products = [
    mk('elbise1', 'elbise', 'siyah'),
    mk('ayakkabi1', 'ayakkabi', 'siyah'),
    mk('canta1', 'canta', 'bej'),
    mk('aksesuar1', 'aksesuar', 'siyah'),
    mk('elbise2', 'elbise', 'kirmizi'),
  ];
  const plans = ruleBasedCombos(products);
  const forBase = plans.filter((p) => p.baseId === 'elbise1');
  assert.ok(forBase.length >= 1 && forBase.length <= 2);
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const plan of plans) {
    assert.notEqual(byId.get(plan.baseId)!.category, byId.get(plan.suggestId)!.category);
    assert.ok(plan.text.length > 0);
  }
});

test('widget ingest: ürün oluşturur, tekrarında known=true döner', async () => {
  const product = {
    id: 'ing-1', url: 'https://magaza.test/urun?id=ing-1', name: 'Siyah Baskılı Tişört',
    price: 349, currency: 'TRY', image: 'https://magaza.test/i.jpg', category: 'Erkek / Tişört',
  };
  const r1 = await app.inject({
    method: 'POST', url: '/api/widget/ingest', payload: { token: TOKEN, product },
  });
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.json().known, false);

  const r2 = await app.inject({
    method: 'POST', url: '/api/widget/ingest', payload: { token: TOKEN, product },
  });
  assert.equal(r2.json().known, true);

  const bad = await app.inject({
    method: 'POST', url: '/api/widget/ingest', payload: { token: TOKEN, product: { name: 'eksik' } },
  });
  assert.equal(bad.statusCode, 400);

  const rows = await prisma.product.findMany({ where: { customerId, externalId: 'ing-1' } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'jsonld');
});

test('zenginleştirme fallback + kombin üretimi Combo yazar ve config\'e düşer', async () => {
  await prisma.product.create({
    data: {
      customerId, externalId: 'ing-2', url: 'https://magaza.test/urun?id=ing-2',
      name: 'Slim Fit Siyah Jean', price: 459, source: 'jsonld',
    },
  });
  const enriched = await enrichPending(customerId);
  assert.ok(enriched >= 1);

  const jean = await prisma.product.findUniqueOrThrow({
    where: { customerId_externalId: { customerId, externalId: 'ing-2' } },
  });
  assert.equal(jean.category, 'alt-giyim'); // kural: "jean" → alt-giyim
  assert.equal(jean.color, 'siyah');

  const created = await generateCombos(customerId);
  assert.ok(created >= 1); // tişört (üst) + jean (alt) tamamlayıcı

  // Aynı çift ikinci çağrıda tekrar üretilmez
  const again = await generateCombos(customerId);
  assert.equal(again, 0);

  // Ajanın kurduğu kombin widget config'inde yayında
  const cfg = await app.inject({
    method: 'GET',
    url: '/api/widget/config?token=' + TOKEN + '&url=' + encodeURIComponent('https://magaza.test/urun?id=ing-1'),
  });
  assert.equal(cfg.statusCode, 200);
  assert.ok(cfg.json().combos.length >= 1);

  const activity = await prisma.agentEvent.findMany({ where: { customerId } });
  const types = new Set(activity.map((a) => a.type));
  assert.ok(types.has('product_found'));
  assert.ok(types.has('combo_created'));
});
