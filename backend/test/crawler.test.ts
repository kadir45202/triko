// Keşif katmanı testleri: link çıkarımı/sınıflandırma, çok sinyalli ürün
// çıkarımı, platform API keşfi ve link takibiyle (sitemap'siz) site gezme.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  classifyUrl,
  crawlSite,
  extractHeuristicProduct,
  extractLinks,
  extractMicrodataProduct,
  extractOgProduct,
  extractProducts,
  fetchPlatformProducts,
  normalizeUrl,
  parseTrPrice,
} from '../src/lib/crawler';

test('classifyUrl: ürün/kategori/diğer kalıpları', () => {
  assert.equal(classifyUrl('https://a.com/urun/siyah-elbise'), 'product');
  assert.equal(classifyUrl('https://a.com/p/12345'), 'product');
  assert.equal(classifyUrl('https://a.com/elbise-p-98765'), 'product');
  assert.equal(classifyUrl('https://a.com/detay?id=x-1'), 'product');
  assert.equal(classifyUrl('https://a.com/pamuklu-midi-etek-beyaz-4173105'), 'product'); // Koton/Akinon tarzı
  assert.equal(classifyUrl('https://a.com/pamuklu-midi-etek-beyaz-4173105/'), 'product');
  assert.equal(classifyUrl('https://a.com/kampanya-2026'), 'other'); // kısa rakam ürün değil
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

test('parseTrPrice: Türkçe fiyat biçimleri', () => {
  assert.equal(parseTrPrice('1.899,90'), 1899.9);
  assert.equal(parseTrPrice('1.899'), 1899);
  assert.equal(parseTrPrice('749,50'), 749.5);
  assert.equal(parseTrPrice('2499'), 2499);
  assert.equal(parseTrPrice('12.5'), 12.5);
  assert.equal(parseTrPrice(''), null);
});

test('sezgisel çıkarım: yapılandırılmış veri yoksa h1 + fiyat kalıbından okur', () => {
  const html =
    '<html><head><title>Oversize Triko Kazak | MağazaX</title>' +
    '<meta property="og:image" content="https://a.com/kazak.jpg"></head>' +
    '<body><h1>Oversize <span>Triko</span> Kazak</h1><div class="fiyat">1.299,90 TL</div></body></html>';
  const p = extractHeuristicProduct(html, 'https://a.com/urun/oversize-triko-kazak');
  assert.ok(p);
  assert.equal(p!.name, 'Oversize Triko Kazak');
  assert.equal(p!.price, 1299.9);
  assert.equal(p!.imageUrl, 'https://a.com/kazak.jpg');

  // ürün-benzeri olmayan URL'de asla çalışmaz (liste sayfasını ürün sanma)
  assert.equal(extractHeuristicProduct(html, 'https://a.com/kategori/kazak'), null);
  // fiyat bulunamazsa ürün sayılmaz
  assert.equal(extractHeuristicProduct('<h1>Başlık</h1>', 'https://a.com/urun/x'), null);
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

// --- platform API keşfi: sahte Shopify ve WooCommerce uçları ---

const apiServers: http.Server[] = [];

function listen(server: http.Server): Promise<string> {
  apiServers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve('http://127.0.0.1:' + (server.address() as AddressInfo).port);
    });
  });
}

after(() => Promise.all(apiServers.map((s) => new Promise<void>((r) => s.close(() => r())))));

test('fetchPlatformProducts: Shopify /products.json kataloğunu okur', async () => {
  const origin = await listen(
    http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://x');
      if (url.pathname === '/products.json') {
        res.setHeader('content-type', 'application/json');
        const page = Number(url.searchParams.get('page') || 1);
        const products =
          page === 1
            ? [
                {
                  id: 111, title: 'Saten Midi Elbise', handle: 'saten-midi-elbise',
                  product_type: 'Elbise',
                  variants: [{ price: '1899.90' }],
                  images: [{ src: 'https://cdn.x/elbise.jpg' }],
                },
                { id: 222, title: 'Süet Bot', handle: 'suet-bot', product_type: '', variants: [], images: [] },
              ]
            : [];
        return res.end(JSON.stringify({ products }));
      }
      res.statusCode = 404;
      res.end('yok');
    }),
  );
  const cat = await fetchPlatformProducts(origin + '/');
  assert.ok(cat);
  assert.equal(cat!.platform, 'shopify');
  assert.equal(cat!.products.length, 2);
  assert.equal(cat!.products[0].name, 'Saten Midi Elbise');
  assert.equal(cat!.products[0].price, 1899.9);
  assert.equal(cat!.products[0].url, origin + '/products/saten-midi-elbise');
  assert.equal(cat!.products[0].rawCategory, 'Elbise');
  assert.equal(cat!.products[1].price, null);
});

test('fetchPlatformProducts: WooCommerce Store API kataloğunu okur', async () => {
  const origin = await listen(
    http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://x');
      if (url.pathname === '/wp-json/wc/store/v1/products') {
        res.setHeader('content-type', 'application/json');
        const page = Number(url.searchParams.get('page') || 1);
        const items =
          page === 1
            ? [
                {
                  id: 42, name: 'Keten Gömlek &amp; Co', // Woo isimleri HTML entity içerebilir
                  permalink: 'https://magaza.x/urun/keten-gomlek',
                  prices: { price: '74990', currency_code: 'TRY', currency_minor_unit: 2 },
                  images: [{ src: 'https://magaza.x/kg.jpg' }],
                  categories: [{ name: 'Gömlek' }],
                },
              ]
            : [];
        return res.end(JSON.stringify(items));
      }
      res.statusCode = 404;
      res.end('yok');
    }),
  );
  const cat = await fetchPlatformProducts(origin + '/');
  assert.ok(cat);
  assert.equal(cat!.platform, 'woocommerce');
  assert.equal(cat!.products.length, 1);
  assert.equal(cat!.products[0].name, 'Keten Gömlek & Co');
  assert.equal(cat!.products[0].price, 749.9);
  assert.equal(cat!.products[0].currency, 'TRY');
  assert.equal(cat!.products[0].rawCategory, 'Gömlek');
});

test('fetchPlatformProducts: platform yoksa null (JSON yerine HTML dönse bile)', async () => {
  const origin = await listen(
    http.createServer((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end('<html>SPA fallback</html>'); // her yola 200 + HTML dönen site
    }),
  );
  assert.equal(await fetchPlatformProducts(origin + '/'), null);
});
