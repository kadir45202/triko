// Site uyumu ön-kontrolü (#3) ve URL eşleştirme sağlamlaştırma (#6) testleri.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { diagnoseSite, htmlSignals } from '../src/lib/preflight';
import { urlKey, urlMatches } from '../src/lib/urlmatch';

// ---------- htmlSignals (saf) ----------

test('htmlSignals: SPA kabuğunu tanır (düşük metin, framework işareti)', () => {
  const spa =
    '<!doctype html><html><head><title>Shop</title></head><body>' +
    '<div id="root"></div>' +
    '<script>window.__NEXT_DATA__ = {"props":{}}</script>' +
    '<noscript>Bu site için JavaScript gerekli</noscript></body></html>';
  const s = htmlSignals(spa);
  assert.ok(s.spaMarkers.includes('next.js'), 'next.js işareti');
  assert.ok(s.spaMarkers.length >= 2);
  assert.ok(s.textRatio < 0.2, 'kabuk metni düşük olmalı');
  assert.equal(s.hasJsonLdProduct, false);
});

test('htmlSignals: statik ürün sayfasında JSON-LD/fiyat sinyali', () => {
  const html =
    '<html><body><h1>Siyah Elbise</h1>' +
    '<script type="application/ld+json">{"@type":"Product","name":"Siyah Elbise","offers":{"price":"499"}}</script>' +
    '<span>499 TL</span></body></html>';
  const s = htmlSignals(html);
  assert.equal(s.hasJsonLdProduct, true);
  assert.equal(s.hasPrice, true);
  assert.equal(s.spaMarkers.length, 0);
});

// ---------- urlKey (saf) ----------

test('urlKey: protokol/www/sonda-slash/izleme parametrelerini normalize eder', () => {
  const a = urlKey('https://www.shop.com/urun/5/');
  assert.equal(a, 'shop.com/urun/5');
  assert.equal(urlKey('http://shop.com/urun/5'), 'shop.com/urun/5');
  assert.equal(urlKey('https://shop.com/urun/5?utm_source=ig&fbclid=x'), 'shop.com/urun/5');
  // kimlik parametresi korunur
  assert.equal(urlKey('https://shop.com/detay?id=42&utm_source=x'), 'shop.com/detay?id=42');
  // URL olmayan (kısmi kalıp) → null
  assert.equal(urlKey('urun.html?id=k-elbise'), null);
});

// ---------- urlMatches (#6 sessiz kaçırma + taşma) ----------

// Ajanın kurduğu trigger = escapeRegex(ürün URL'si)
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('urlMatches: tam-URL trigger, trailing-slash/www/izleme farkına rağmen eşleşir', () => {
  const trigger = escapeRegex('https://shop.com/urun/5');
  assert.equal(urlMatches(trigger, 'https://www.shop.com/urun/5/'), true);
  assert.equal(urlMatches(trigger, 'http://shop.com/urun/5?utm_source=ig'), true);
});

test('urlMatches: tam-URL trigger alt-dize taşmasına düşmez (…/5 ≠ …/50)', () => {
  const trigger = 'https://shop.com/urun/5'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.equal(urlMatches(trigger, 'https://shop.com/urun/50'), false);
});

test('urlMatches: kısmi/elle kalıp eski regex davranışını korur', () => {
  assert.equal(urlMatches('urun\\.html\\?id=k-elbise', 'http://x/store/urun.html?id=k-elbise'), true);
  assert.equal(urlMatches('urun\\.html\\?id=k-elbise', 'http://x/store/urun.html?id=e-jean'), false);
  assert.equal(urlMatches('', 'http://x/anything'), true);
});

// ---------- diagnoseSite (lokal fixture sunucular) ----------

function serve(handler: (path: string, res: http.ServerResponse) => void): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const path = (req.url || '/').split('?')[0];
      handler(path, res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

test('diagnoseSite: statik JSON-LD ürünlü site → ok', async () => {
  const srv = await serve((path, res) => {
    if (path === '/products.json' || path.startsWith('/wp-json')) {
      res.writeHead(404); res.end('no'); return;
    }
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Mağaza</h1><a href="/urun/1">Siyah Elbise</a></body></html>');
      return;
    }
    if (path === '/urun/1') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Siyah Elbise</h1>' +
        '<script type="application/ld+json">{"@type":"Product","name":"Siyah Elbise","url":"/urun/1","offers":{"price":"499","priceCurrency":"TRY"}}</script>' +
        '</body></html>');
      return;
    }
    res.writeHead(404); res.end('x');
  });
  after(srv.close);
  const d = await diagnoseSite(srv.url);
  assert.equal(d.verdict, 'ok');
  assert.ok(d.productsFound >= 1);
  assert.equal(d.samples[0].name, 'Siyah Elbise');
});

test('diagnoseSite: SPA kabuğu → spa_risk', async () => {
  const srv = await serve((path, res) => {
    if (path === '/products.json' || path.startsWith('/wp-json')) { res.writeHead(404); res.end('no'); return; }
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><title>Shop</title></head><body>' +
        '<div id="root"></div><script>window.__NEXT_DATA__={"props":{}}</script>' +
        '<noscript>JavaScript gerekli</noscript></body></html>');
      return;
    }
    res.writeHead(404); res.end('x');
  });
  after(srv.close);
  const d = await diagnoseSite(srv.url);
  assert.equal(d.verdict, 'spa_risk');
  assert.ok(d.signals && d.signals.spaMarkers.length >= 1);
});

test('diagnoseSite: bot koruması (403) → blocked', async () => {
  const srv = await serve((_path, res) => { res.writeHead(403); res.end('forbidden'); });
  after(srv.close);
  const d = await diagnoseSite(srv.url);
  assert.equal(d.verdict, 'blocked');
});

test('diagnoseSite: geçersiz adres → invalid', async () => {
  const d = await diagnoseSite('not-a-url');
  assert.equal(d.verdict, 'invalid');
  assert.equal(d.reachable, false);
});
