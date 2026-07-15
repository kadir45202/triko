// Site keşif katmanı (Faz A) — deterministik kısım. Sitemap KULLANILMAZ
// (pratikte çoğu sitede eksik/bozuk çıktığı için kaldırıldı).
// İki keşif kanalı sırayla denenir:
//   1) Platform ürün API'leri: Shopify /products.json, WooCommerce Store API.
//      Uç varsa tüm katalog birkaç istekle eksiksiz gelir.
//   2) Sayfa içi link takibi (BFS): anasayfa + yaygın katalog yollarından
//      başlar, kategori → ürün linklerini bir ziyaretçi gibi izler.
// Ürün verisi dört sinyalden okunur: JSON-LD → mikrodata → OpenGraph →
// sezgisel (h1/title + fiyat kalıbı; yalnızca URL'i ürün gibi görünen sayfada).
// Anlama gerektiren işler (zenginleştirme, kombinleme) agent.ts'te Claude'a gider.

export type RawProduct = {
  externalId: string;
  url: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  rawCategory?: string | null;
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 900_000;
const MAX_JSON_BYTES = 6_000_000; // platform API yanıtları (250 ürünlük sayfa) büyük olabilir
export const MAX_PAGES = Number(process.env.AGENT_MAX_PAGES || 120);
const MAX_DEPTH = Number(process.env.AGENT_MAX_DEPTH || 3);
const MAX_QUEUE = 2_000; // keşfedilen link kuyruğu üst sınırı (bellek koruması)
const CRAWL_DELAY_MS = Number(process.env.AGENT_CRAWL_DELAY_MS || 150);
const CONCURRENCY = 3;
const MAX_API_PAGES = 10; // platform API sayfalama üst sınırı

// Bazı siteler tanınmayan bot kimliklerini (403/challenge ile) engelliyor.
// Mağaza sahibi kendi sitesini taradığı için normal tarayıcı kimliği kullanılır.
const REQUEST_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8',
};

async function fetchBody(url: string, accept: string, maxBytes: number): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { ...REQUEST_HEADERS, accept },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchText(url: string): Promise<string | null> {
  return fetchBody(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', MAX_BODY_BYTES);
}

// Ön-kontrol (preflight) için: gövdeyle birlikte HTTP durum kodunu da döndürür,
// böylece "engellendi" (403/429) ile "erişilemez" (ağ hatası) ayırt edilebilir.
// status 0 = ağ hatası/zaman aşımı.
export async function fetchWithStatus(url: string): Promise<{ status: number; body: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { ...REQUEST_HEADERS, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    });
    const text = await res.text();
    return { status: res.status, body: text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url: string): Promise<unknown | null> {
  const body = await fetchBody(url, 'application/json,*/*;q=0.5', MAX_JSON_BYTES);
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null; // uç 200 dönüp HTML verdiyse (SPA fallback) platform yok say
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function baseOrigin(siteUrl: string): string {
  const u = new URL(siteUrl);
  return u.origin;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- platform ürün API'leri (1. keşif kanalı) ----------
// Yaygın e-ticaret altyapıları kataloğu herkese açık JSON uçlarından verir;
// bu uçlar sayfa gezmekten hem hızlı hem eksiksizdir.

export type PlatformCatalog = {
  platform: 'shopify' | 'woocommerce';
  products: RawProduct[];
  requests: number;
  urls: string[]; // yapılan API isteklerinin adresleri (panelde "taranan sayfalar")
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

async function shopifyCatalog(origin: string): Promise<PlatformCatalog | null> {
  const products: RawProduct[] = [];
  const urls: string[] = [];
  let requests = 0;
  for (let page = 1; page <= MAX_API_PAGES; page++) {
    const reqUrl = `${origin}/products.json?limit=250&page=${page}`;
    const data = asRecord(await fetchJson(reqUrl));
    requests++;
    urls.push(reqUrl);
    if (!data || !Array.isArray(data.products)) break;
    const batch = data.products as unknown[];
    if (!batch.length) break;
    for (const item of batch) {
      const p = asRecord(item);
      if (!p || typeof p.title !== 'string' || typeof p.handle !== 'string') continue;
      const variant = asRecord(Array.isArray(p.variants) ? p.variants[0] : null);
      const image = asRecord(Array.isArray(p.images) ? p.images[0] : null);
      products.push({
        externalId: String(p.id ?? p.handle).slice(0, 120),
        url: origin + '/products/' + p.handle,
        name: decodeEntities(p.title).slice(0, 200),
        price: toNumber(variant?.price),
        currency: null, // products.json para birimi vermez; kayıt katmanı TRY varsayar
        imageUrl: typeof image?.src === 'string' ? image.src : null,
        rawCategory: typeof p.product_type === 'string' && p.product_type ? p.product_type : null,
      });
    }
    if (batch.length < 250) break;
    await sleep(CRAWL_DELAY_MS);
  }
  return products.length ? { platform: 'shopify', products, requests, urls } : null;
}

// Store API fiyatları alt birim cinsinden string döner ("129990" + minor_unit 2)
function wooPrice(prices: Record<string, unknown> | null): number | null {
  if (!prices) return null;
  const raw = prices.price ?? prices.regular_price;
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  if (!isFinite(n)) return null;
  const minor = Number(prices.currency_minor_unit ?? 2);
  return n / Math.pow(10, isFinite(minor) ? minor : 2);
}

async function wooCatalog(origin: string): Promise<PlatformCatalog | null> {
  // wp-json rewrite kapalı sitelerde ?rest_route= biçimi çalışır
  const bases = [
    origin + '/wp-json/wc/store/v1/products',
    origin + '/?rest_route=/wc/store/v1/products',
  ];
  for (const base of bases) {
    const sep = base.includes('?') ? '&' : '?';
    const products: RawProduct[] = [];
    const urls: string[] = [];
    let requests = 0;
    for (let page = 1; page <= MAX_API_PAGES; page++) {
      const reqUrl = `${base}${sep}per_page=100&page=${page}`;
      const data = await fetchJson(reqUrl);
      requests++;
      urls.push(reqUrl);
      if (!Array.isArray(data) || !data.length) break;
      let valid = 0;
      for (const item of data) {
        const p = asRecord(item);
        if (!p || typeof p.name !== 'string' || typeof p.permalink !== 'string') continue;
        valid++;
        const prices = asRecord(p.prices);
        const image = asRecord(Array.isArray(p.images) ? p.images[0] : null);
        const category = asRecord(Array.isArray(p.categories) ? p.categories[0] : null);
        products.push({
          externalId: String(p.id ?? externalIdFromUrl(p.permalink)).slice(0, 120),
          url: p.permalink,
          name: decodeEntities(p.name).slice(0, 200),
          price: wooPrice(prices),
          currency: typeof prices?.currency_code === 'string' ? prices.currency_code : null,
          imageUrl: typeof image?.src === 'string' ? image.src : null,
          rawCategory: typeof category?.name === 'string' ? decodeEntities(category.name) : null,
        });
      }
      if (!valid) break; // JSON döndü ama ürün şeması değil
      if (data.length < 100) break;
      await sleep(CRAWL_DELAY_MS);
    }
    if (products.length) return { platform: 'woocommerce', products, requests, urls };
  }
  return null;
}

export async function fetchPlatformProducts(siteUrl: string): Promise<PlatformCatalog | null> {
  const origin = baseOrigin(siteUrl);
  return (await shopifyCatalog(origin)) || (await wooCatalog(origin));
}

// ---------- JSON-LD çıkarımı ----------

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.,]/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  return null;
}

function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) for (const x of v) { const s = firstString(x); if (s) return s; }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return firstString(o.url ?? o['@id'] ?? o.name ?? null);
  }
  return null;
}

function isProductNode(node: Record<string, unknown>): boolean {
  const t = node['@type'];
  if (typeof t === 'string') return t.toLowerCase() === 'product';
  if (Array.isArray(t)) return t.some((x) => typeof x === 'string' && x.toLowerCase() === 'product');
  return false;
}

function productFromNode(node: Record<string, unknown>, pageUrl: string): RawProduct | null {
  const name = firstString(node.name);
  if (!name) return null;
  const offers = (Array.isArray(node.offers) ? node.offers[0] : node.offers) as
    | Record<string, unknown>
    | undefined;
  const url = firstString(node.url) || pageUrl;
  const externalId =
    firstString(node.sku) ||
    firstString(node.productID) ||
    firstString(node['@id']) ||
    externalIdFromUrl(url);
  return {
    externalId: String(externalId).slice(0, 120),
    url,
    name: name.slice(0, 200),
    price: toNumber(offers?.price ?? offers?.lowPrice ?? node.price),
    currency: firstString(offers?.priceCurrency ?? null) || 'TRY',
    imageUrl: firstString(node.image),
    rawCategory: firstString(node.category),
  };
}

// URL'den kararlı bir kimlik üret: query'deki id/sku parametresi ya da son path parçası
export function externalIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('id') || u.searchParams.get('sku') || u.searchParams.get('p');
    if (q) return q;
    const parts = u.pathname.split('/').filter(Boolean);
    return (parts[parts.length - 1] || u.hostname).replace(/\.[a-z]+$/i, '');
  } catch {
    return url.slice(-80);
  }
}

// Sayfadaki <script type="application/ld+json"> bloklarından Product düğümlerini topla
export function extractJsonLdProducts(html: string, pageUrl: string): RawProduct[] {
  const out: RawProduct[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack: unknown[] = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== 'object') continue;
      const obj = node as Record<string, unknown>;
      if (isProductNode(obj)) {
        const p = productFromNode(obj, pageUrl);
        if (p) out.push(p);
      }
      if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]));
      if (obj.mainEntity) stack.push(obj.mainEntity);
      if (Array.isArray(obj.itemListElement)) {
        for (const el of obj.itemListElement as Array<Record<string, unknown>>) {
          if (el && typeof el === 'object' && el.item) stack.push(el.item);
        }
      }
    }
  }
  return out;
}

// ---------- mikrodata çıkarımı (JSON-LD yoksa 2. sinyal) ----------

function attrValue(tag: string): string | null {
  // content > src > href sırasıyla; ürün detay sayfası tek ürün varsayılır
  const m =
    /content\s*=\s*["']([^"']+)["']/i.exec(tag) ||
    /src\s*=\s*["']([^"']+)["']/i.exec(tag) ||
    /href\s*=\s*["']([^"']+)["']/i.exec(tag);
  return m ? m[1] : null;
}

function microProp(html: string, prop: string): string | null {
  const re = new RegExp('<[^>]*itemprop\\s*=\\s*["\']' + prop + '["\'][^>]*>', 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const fromAttr = attrValue(m[0]);
    if (fromAttr) return fromAttr.trim();
    // attribute yoksa etiketin iç metnine bak (<span itemprop="name">Elbise</span>)
    const rest = html.slice(m.index + m[0].length);
    const text = /^([^<]{1,300})</.exec(rest);
    if (text && text[1].trim()) return text[1].trim();
  }
  return null;
}

export function extractMicrodataProduct(html: string, pageUrl: string): RawProduct | null {
  if (!/itemtype\s*=\s*["']https?:\/\/schema\.org\/Product["']/i.test(html)) return null;
  const name = microProp(html, 'name');
  if (!name) return null;
  return {
    externalId: (microProp(html, 'sku') || microProp(html, 'productID') || externalIdFromUrl(pageUrl)).slice(0, 120),
    url: pageUrl,
    name: name.slice(0, 200),
    price: toNumber(microProp(html, 'price')),
    currency: microProp(html, 'priceCurrency') || 'TRY',
    imageUrl: microProp(html, 'image'),
    rawCategory: microProp(html, 'category'),
  };
}

// ---------- OpenGraph çıkarımı (3. sinyal) ----------

function metaContent(html: string, property: string): string | null {
  // property="og:x" content="..." — iki attribute sırası da desteklenir
  const re = new RegExp(
    '<meta[^>]+(?:property|name)\\s*=\\s*["\']' + property.replace(/[.:]/g, '\\$&') +
    '["\'][^>]*>',
    'i',
  );
  const m = re.exec(html);
  if (!m) return null;
  const c = /content\s*=\s*["']([^"']*)["']/i.exec(m[0]);
  return c && c[1].trim() ? c[1].trim() : null;
}

export function extractOgProduct(html: string, pageUrl: string): RawProduct | null {
  const type = metaContent(html, 'og:type');
  if (!type || !/product/i.test(type)) return null; // her sayfayı ürün sanma
  const name = metaContent(html, 'og:title');
  if (!name) return null;
  const url = metaContent(html, 'og:url') || pageUrl;
  return {
    externalId: externalIdFromUrl(url).slice(0, 120),
    url,
    name: name.slice(0, 200),
    price: toNumber(metaContent(html, 'product:price:amount') || metaContent(html, 'og:price:amount')),
    currency: metaContent(html, 'product:price:currency') || metaContent(html, 'og:price:currency') || 'TRY',
    imageUrl: metaContent(html, 'og:image'),
    rawCategory: null,
  };
}

// ---------- sezgisel çıkarım (4. sinyal — yapılandırılmış veri hiç yoksa) ----------
// Yalnızca URL'i ürün sayfası gibi görünen sayfalarda çalışır ve hem isim hem
// fiyat ister; liste/blog sayfalarını ürün sanmamak için bilerek muhafazakâr.

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Türkçe fiyat gösterimini sayıya çevir: "1.899,90" → 1899.9, "1.899" → 1899
export function parseTrPrice(s: string): number | null {
  const cleaned = s.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = cleaned.split('.');
    // "1.899" biçimi: son grup 3 haneliyse binlik ayracıdır
    if (parts.length > 1 && parts[parts.length - 1].length === 3) normalized = parts.join('');
  }
  const n = parseFloat(normalized);
  return isFinite(n) && n > 0 ? n : null;
}

export function extractHeuristicProduct(html: string, pageUrl: string): RawProduct | null {
  if (classifyUrl(pageUrl) !== 'product') return null;
  const h1 = /<h1[^>]*>([\s\S]{1,500}?)<\/h1>/i.exec(html);
  let name = h1 ? stripTags(h1[1]) : '';
  if (!name) {
    const t = /<title[^>]*>([^<]{2,200})<\/title>/i.exec(html);
    name = t ? decodeEntities(t[1].split('|')[0]).trim() : '';
  }
  if (!name) return null;
  const priceMatch =
    /(?:₺|\bTL\b)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/.exec(html) ||
    /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:₺|\bTL\b)/.exec(html);
  const price = priceMatch ? parseTrPrice(priceMatch[1] || priceMatch[2] || '') : null;
  if (price == null) return null;
  return {
    externalId: externalIdFromUrl(pageUrl).slice(0, 120),
    url: pageUrl,
    name: name.slice(0, 200),
    price,
    currency: 'TRY',
    imageUrl: metaContent(html, 'og:image'),
    rawCategory: null,
  };
}

// Dört sinyali sırayla dene: JSON-LD (çok ürün olabilir) → mikrodata → OG → sezgisel
export function extractProducts(html: string, pageUrl: string): RawProduct[] {
  const jsonld = extractJsonLdProducts(html, pageUrl);
  if (jsonld.length) return jsonld;
  const micro = extractMicrodataProduct(html, pageUrl);
  if (micro) return [micro];
  const og = extractOgProduct(html, pageUrl);
  if (og) return [og];
  const heuristic = extractHeuristicProduct(html, pageUrl);
  return heuristic ? [heuristic] : [];
}

// ---------- link keşfi (BFS) ----------

// Ürün olamayacak / taranmaması gereken yollar
const SKIP_URL =
  /\/(sepet|cart|checkout|odeme|payment|login|signin|giris|register|kayit|hesab|account|uye|favori|wishlist|iletisim|contact|hakkimizda|about|blog|yardim|help|sss|faq|kvkk|gizlilik|privacy|policy|sozlesme|terms|api|cdn|wp-admin|wp-login)\b/i;
const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|ico|css|js|mjs|json|xml|txt|pdf|zip|rar|mp4|webm|woff2?|ttf|eot)(\?|$)/i;
const TRACKING_PARAMS = /^(utm_|gclid|fbclid|yclid|mc_|ref$|source$)/i;

export type UrlKind = 'product' | 'listing' | 'other';

// URL kalıbından sayfa türü tahmini — kuyruk önceliği için (kesin hüküm değil,
// her sayfada yine de çok sinyalli çıkarım denenir)
export function classifyUrl(url: string): UrlKind {
  // "-p-123" (Trendyol tarzı) yanında "slug-4173105" (Koton/Akinon tarzı,
  // sonu 5+ haneli ürün koduyla biten) kalıbı da ürün sayılır
  if (/(\/urun|\/product|\/prod\b|\/p\/|\/prd|\/item|\/dp\/|-p-\d+|[?&](id|sku|pid|product_id|urun)=)/i.test(url) ||
      /-\d{5,}\/?(\?|$)/.test(url)) {
    return 'product';
  }
  if (/(kategori|category|collection|koleksiyon|\/c\/|\/k\/|\/liste|[?&](page|sayfa|pg)=|\/(kadin|erkek|cocuk|indirim|sale|outlet|yeni|new)\b)/i.test(url)) {
    return 'listing';
  }
  return 'other';
}

// Takip edilebilir hale getir: fragment at, izleme parametrelerini temizle
export function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    const drop: string[] = [];
    u.searchParams.forEach((_, k) => { if (TRACKING_PARAMS.test(k)) drop.push(k); });
    for (const k of drop) u.searchParams.delete(k);
    let s = u.toString();
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

// Sayfadaki aynı-origin, taranabilir linkleri çıkar
export function extractLinks(html: string, pageUrl: string): string[] {
  const origin = baseOrigin(pageUrl);
  const out = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    const url = normalizeUrl(href, pageUrl);
    if (!url || !url.startsWith(origin)) continue;
    if (SKIP_EXT.test(url) || SKIP_URL.test(url)) continue;
    out.add(url);
    if (out.size >= 500) break; // tek sayfadan makul üst sınır
  }
  return [...out];
}

// ---------- BFS site örümceği (2. keşif kanalı) ----------
// Anasayfa + yaygın katalog giriş yolları tohumlanır; kategori → ürün linkleri
// izlenerek ürün sayfalarına ulaşılır. Ürün-benzeri URL'ler önce taranır.

// Menüde linki olmasa da denemeye değer yaygın katalog giriş noktaları.
// Var olmayanlar hızlı 404 döner ve sayfa bütçesinden düşmez.
const COMMON_ENTRY_PATHS = [
  '/collections/all', '/shop', '/magaza', '/urunler', '/tum-urunler',
  '/products', '/kategori', '/kadin', '/erkek', '/yeni-gelenler', '/indirim',
];

export type CrawlStats = { pagesFetched: number; queued: number };

export async function crawlSite(
  siteUrl: string,
  onPage: (url: string, html: string) => Promise<void>,
): Promise<CrawlStats> {
  const start = normalizeUrl(siteUrl, siteUrl);
  if (!start) return { pagesFetched: 0, queued: 0 };
  const origin = baseOrigin(start);

  // Öncelikli kuyruklar: ürün > liste > diğer (her giriş: [url, derinlik])
  const queues: Record<UrlKind, Array<[string, number]>> = { product: [], listing: [], other: [] };
  const seen = new Set<string>();

  function enqueue(url: string, depth: number) {
    if (seen.has(url) || seen.size >= MAX_QUEUE) return;
    seen.add(url);
    queues[classifyUrl(url)].push([url, depth]);
  }

  enqueue(start, 0);
  for (const path of COMMON_ENTRY_PATHS) enqueue(origin + path, 1);

  function nextBatch(size: number): Array<[string, number]> {
    const batch: Array<[string, number]> = [];
    for (const kind of ['product', 'listing', 'other'] as UrlKind[]) {
      while (batch.length < size && queues[kind].length) batch.push(queues[kind].shift()!);
    }
    return batch;
  }

  let fetched = 0;
  while (fetched < MAX_PAGES) {
    const batch = nextBatch(Math.min(CONCURRENCY, MAX_PAGES - fetched));
    if (!batch.length) break;
    await Promise.all(
      batch.map(async ([url, depth]) => {
        const html = await fetchText(url);
        if (!html) return;
        fetched++;
        await onPage(url, html);
        if (depth < MAX_DEPTH) {
          for (const link of extractLinks(html, url)) enqueue(link, depth + 1);
        }
      }),
    );
    await sleep(CRAWL_DELAY_MS);
  }
  return { pagesFetched: fetched, queued: seen.size };
}
