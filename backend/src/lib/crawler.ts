// Site keşif katmanı (Faz A) — deterministik kısım.
// robots.txt → sitemap → ürün sayfaları; sayfalardaki schema.org/Product
// JSON-LD verisini çıkarır. Anlama gerektiren işler (JSON-LD'siz sayfadan
// ürün çıkarma, zenginleştirme, kombinleme) agent.ts'te Claude'a gider.

export type RawProduct = {
  externalId: string;
  url: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  rawCategory?: string | null;
};

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 900_000;
export const MAX_PAGES = Number(process.env.AGENT_MAX_PAGES || 120);
const CRAWL_DELAY_MS = Number(process.env.AGENT_CRAWL_DELAY_MS || 150);
const CONCURRENCY = 3;

export async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'TrikoBot/1.0 (+https://triko.app)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- sitemap keşfi ----------

export function parseSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(decodeXml(m[1]));
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function baseOrigin(siteUrl: string): string {
  const u = new URL(siteUrl);
  return u.origin;
}

// robots.txt'teki Sitemap: satırları + bilinen sitemap adresleri
export async function discoverPageUrls(siteUrl: string): Promise<string[]> {
  const origin = baseOrigin(siteUrl);
  const candidates: string[] = [];

  const robots = await fetchText(origin + '/robots.txt');
  if (robots) {
    for (const line of robots.split('\n')) {
      const m = /^\s*sitemap:\s*(\S+)/i.exec(line);
      if (m) candidates.push(m[1]);
    }
  }
  // siteUrl'in kendisi bir sitemap/feed olabilir
  if (/\.xml(\?|$)/i.test(siteUrl)) candidates.unshift(siteUrl);
  candidates.push(
    origin + '/sitemap.xml',
    origin + '/sitemap_index.xml',
    new URL('sitemap.xml', siteUrl.endsWith('/') ? siteUrl : siteUrl + '/').toString(),
  );

  const seen = new Set<string>();
  const pages = new Set<string>();
  for (const sm of candidates) {
    if (seen.has(sm) || pages.size >= MAX_PAGES) continue;
    seen.add(sm);
    const xml = await fetchText(sm);
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
    const locs = parseSitemapLocs(xml);
    if (/<sitemapindex/i.test(xml)) {
      // sitemap index: alt sitemap'leri sıraya al (derinlik 1)
      for (const child of locs.slice(0, 10)) {
        if (seen.has(child)) continue;
        seen.add(child);
        const childXml = await fetchText(child);
        if (childXml) for (const l of parseSitemapLocs(childXml)) pages.add(l);
        if (pages.size >= MAX_PAGES * 3) break;
      }
    } else {
      for (const l of locs) pages.add(l);
    }
    if (pages.size) break; // ilk çalışan sitemap yeter
  }

  // Ürün olma ihtimali yüksek URL'leri öne al (urun|product|/p/ kalıpları)
  const all = [...pages].filter((u) => u.startsWith(origin));
  const productish = all.filter((u) => /urun|product|\/p\/|\/prd|item/i.test(u));
  const rest = all.filter((u) => !productish.includes(u));
  return [...productish, ...rest].slice(0, MAX_PAGES);
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

// ---------- nazik sayfa çekme kuyruğu ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function crawlPages(
  urls: string[],
  onPage: (url: string, html: string) => Promise<void>,
): Promise<number> {
  let index = 0;
  let fetched = 0;
  async function worker() {
    while (index < urls.length) {
      const url = urls[index++];
      const html = await fetchText(url);
      if (html) {
        fetched++;
        await onPage(url, html);
      }
      await sleep(CRAWL_DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return fetched;
}
