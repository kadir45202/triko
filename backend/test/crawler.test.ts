// BFS örümceği testleri: link çıkarımı/sınıflandırma, mikrodata/OG çıkarımı
// ve sitemap'siz bir sitede kategori → ürün link takibiyle keşif.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  classifyUrl,
  crawlSite,
  extractLinks,
  extractMicrodataProduct,
  extractOgProduct,
  extractProducts,
  normalizeUrl,
} from '../src/lib/crawler';

test('classifyUrl: ürün/kategori/diğer kalıpları', () => {
  assert.equal(classifyUrl('https://a.com/urun/siyah-elbise'), 'product');
  assert.equal(classifyUrl('https://a.com/p/12345'), 'product');
  assert.equal(classifyUrl('https://a.com/elbise-p-98765'), 'product');
  assert.equal(classifyUrl('https://a.com/detay?id=x-1'), 'product');
  assert.equal(classifyUrl('https://a.com/kategori/elbise'), 'listing');
  assert.equal(classifyUrl('https://a.com/kadin'), 'listing');
  assert.equal(classifyUrl('https://a.com/liste?page=3'), 'listing');
  assert.equal(classifyUrl('https://a.com/'), 'other');
});

test('normalizeUrl: fragment ve izleme parametreleri atılır', () => {
  assert.equal(
    normalizeUrl('/urun/x?utm_source=mail&id=5#detay', 'https://a.com/kategori'),
    'https://a.com/urun/x?id=5',
  );
  assert.equal(normalizeUrl('mailto:x@y.z', 'https://a.com'), null);
});

test('extractLinks: aynı-origin, sepet/asset hariç, görelileri çözer', () => {
  const html =
    '<a href="/urun/elbise">Elbise</a>' +
    '<a href="kategori/canta?page=2">Çanta</a>' +
    '<a href="https://baska-site.com/urun/x">dış</a>' +
    '<a href="/sepet">Sepet</a>' +
    '<a href="/assets/logo.png">img</a>' +
    '<a href="tel:+90212">ara</a>' +
    '<a href="/urun/elbise#yorumlar">aynı</a>';
  const links = extractLinks(html, 'https://a.com/kadin');
  assert.deepEqual(links.sort(), ['https://a.com/kategori/canta?page=2', 'https://a.com/urun/elbise']);
});

test('mikrodata: itemtype=Product sayfasından ürün çıkar', () => {
  const html =
    '<div itemscope itemtype="https://schema.org/Product">' +
    '<h1 itemprop="name">Keten Gömlek</h1>' +
    '<meta itemprop="sku" content="KG-77">' +
    '<span itemprop="price" content="749.90"></span>' +
    '<meta itemprop="priceCurrency" content="TRY">' +
    '<img itemprop="image" src="https://a.com/kg.jpg">' +
    '</div>';
  const p = extractMicrodataProduct(html, 'https://a.com/urun/keten-gomlek');
  assert.ok(p);
  assert.equal(p!.name, 'Keten Gömlek');
  assert.equal(p!.externalId, 'KG-77');
  assert.equal(p!.price, 749.9);
  assert.equal(p!.imageUrl, 'https://a.com/kg.jpg');

  assert.equal(extractMicrodataProduct('<div>ürünsüz sayfa</div>', 'https://a.com/x'), null);
});

test('OpenGraph: og:type=product sayfasından ürün çıkar, diğer sayfalarda null', () => {
  const html =
    '<meta property="og:type" content="product">' +
    '<meta property="og:title" content="Süet Bot">' +
    '<meta property="og:image" content="https://a.com/bot.jpg">' +
    '<meta property="product:price:amount" content="2499">' +
    '<meta property="product:price:currency" content="TRY">';
  const p = extractOgProduct(html, 'https://a.com/urun/suet-bot');
  assert.ok(p);
  assert.equal(p!.name, 'Süet Bot');
  assert.equal(p!.price, 2499);

  const article = '<meta property="og:type" content="article"><meta property="og:title" content="Blog">';
  assert.equal(extractOgProduct(article, 'https://a.com/blog/x'), null);
});

test('extractProducts: JSON-LD > mikrodata > OG öncelik sırası', () => {
  const both =
    '<script type="application/ld+json">' +
    JSON.stringify({ '@type': 'Product', name: 'LD Ürünü', offers: { price: 100 } }) +
    '</script><meta property="og:type" content="product"><meta property="og:title" content="OG Ürünü">';
  const out = extractProducts(both, 'https://a.com/urun/x');
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'LD Ürünü');
});

// --- uçtan uca: sitemap'siz sahte site — anasayfa → kategori → ürünler ---

let server: http.Server;

function page(body: string): string {
  return '<html><head></head><body><nav><a href="/">Ana</a><a href="/kategori/elbise">Elbiseler</a></nav>' + body + '</body></html>';
}

function fakeSite(): Promise<string> {
  const products: Record<string, { name: string; price: number }> = {
    'saten-elbise': { name: 'Saten Elbise', price: 1899 },
    'keten-elbise': { name: 'Keten Elbise', price: 1299 },
  };
  server = http.createServer((req, res) => {
    const url = req.url || '/';
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (url === '/') {
      res.end(page('<p>hoş geldiniz</p>'));
    } else if (url === '/kategori/elbise') {
      res.end(page('<a href="/urun/saten-elbise">Saten</a><a href="/urun/keten-elbise">Keten</a><a href="/sepet">sepet</a>'));
    } else if (url.startsWith('/urun/')) {
      const slug = url.split('/')[2];
      const p = products[slug];
      if (!p) { res.statusCode = 404; return res.end('yok'); }
      res.end(page(
        '<script type="application/ld+json">' +
        JSON.stringify({ '@type': 'Product', sku: slug, name: p.name, offers: { price: p.price, priceCurrency: 'TRY' } }) +
        '</script><h1>' + p.name + '</h1>',
      ));
    } else {
      res.statusCode = 404; // robots.txt, sitemap.xml dahil — sitemap YOK
      res.end('yok');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve('http://127.0.0.1:' + (server.address() as AddressInfo).port + '/');
    });
  });
}

after(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

test('crawlSite: sitemap olmadan kategori linklerinden ürünleri bulur', async () => {
  const base = await fakeSite();
  const found: string[] = [];
  const stats = await crawlSite(base, async (pageUrl, html) => {
    for (const p of extractProducts(html, pageUrl)) found.push(p.name);
  });
  assert.ok(stats.pagesFetched >= 4); // ana + kategori + 2 ürün
  assert.deepEqual(found.sort(), ['Keten Elbise', 'Saten Elbise']);
});
