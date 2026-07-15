// Site uyumu ön-kontrolü (#3): müşteri taramayı başlatmadan ÖNCE sitesinin
// taranabilir olup olmadığını ve nedenini teşhis eder. Böylece "çalışmıyor"
// sürprizini satıştan/pilottan önce yakalarız.
//
// Verdict:
//   ok          → platform beslemesi VAR ya da statik HTML'de ürün okunuyor
//   spa_risk    → içerik tarayıcıda JS ile üretiliyor (SSR/JSON-LD yok) — tarama boş dönebilir
//   no_products → siteye ulaşıldı ama tanınan ürün verisi yok
//   blocked     → bot koruması (403/429/451) — tarayıcı kimliği engellendi
//   unreachable → ağ hatası/zaman aşımı
//   invalid     → geçersiz adres
import {
  RawProduct,
  classifyUrl,
  extractLinks,
  extractProducts,
  fetchJson,
  fetchText,
  fetchWithStatus,
} from './crawler';

const PREFLIGHT_MAX_PAGES = 8; // ön-kontrol hızlı olmalı: anasayfa + birkaç iç sayfa

export type HtmlSignals = {
  spaMarkers: string[];
  textRatio: number; // görünür metin / ham HTML (SPA kabuğu düşük olur)
  textLength: number;
  hasJsonLdProduct: boolean;
  hasMicrodata: boolean;
  hasOgProduct: boolean;
  hasPrice: boolean;
};

export type Verdict = 'ok' | 'spa_risk' | 'no_products' | 'blocked' | 'unreachable' | 'invalid';

export type SiteDiagnosis = {
  verdict: Verdict;
  reachable: boolean;
  platform: 'shopify' | 'woocommerce' | null;
  pagesFetched: number;
  productsFound: number;
  samples: Array<{ name: string; url: string; price: number | null }>;
  signals: HtmlSignals | null;
  message: string;
  hint: string;
};

// Sayfanın ham HTML'inden istemci-render (SPA) ve ürün sinyallerini çıkar (saf, test edilebilir).
export function htmlSignals(html: string): HtmlSignals {
  const spaMarkers: string[] = [];
  if (/__NEXT_DATA__/.test(html)) spaMarkers.push('next.js');
  if (/window\.__NUXT__|id=["']__nuxt["']/.test(html)) spaMarkers.push('nuxt');
  if (/ng-version=|\sng-app/.test(html)) spaMarkers.push('angular');
  if (/data-reactroot|id=["']root["'][^>]*>\s*<\/div>/.test(html)) spaMarkers.push('react');
  if (/id=["']app["'][^>]*>\s*<\/div>/.test(html)) spaMarkers.push('vue/app');
  if (/<noscript>[^<]*(javascript|enable)/i.test(html)) spaMarkers.push('noscript-uyarı');

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const textRatio = html.length ? text.length / html.length : 0;

  return {
    spaMarkers,
    textRatio,
    textLength: text.length,
    hasJsonLdProduct: /"@type"\s*:\s*("Product"|\[[^\]]*"Product")/i.test(html),
    hasMicrodata: /itemtype\s*=\s*["']https?:\/\/schema\.org\/Product["']/i.test(html),
    hasOgProduct:
      /property=["']og:type["'][^>]*content=["'][^"']*product/i.test(html) ||
      /content=["'][^"']*product["'][^>]*property=["']og:type["']/i.test(html),
    hasPrice: /(₺|\bTL\b|\bTRY\b)\s*\d|\d[\d.,]*\s*(₺|\bTL\b|\bTRY\b)/.test(html),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Hafif platform yoklaması (tam katalog çekmeden, tek istekle uç var mı bak).
async function probePlatform(origin: string): Promise<'shopify' | 'woocommerce' | null> {
  const shop = await fetchJson(origin + '/products.json?limit=1');
  if (isRecord(shop) && Array.isArray(shop.products)) {
    const first = shop.products[0];
    if (!first || (isRecord(first) && typeof first.title === 'string' && typeof first.handle === 'string')) {
      return 'shopify';
    }
  }
  for (const base of [origin + '/wp-json/wc/store/v1/products', origin + '/?rest_route=/wc/store/v1/products']) {
    const sep = base.includes('?') ? '&' : '?';
    const woo = await fetchJson(base + sep + 'per_page=1');
    if (Array.isArray(woo)) {
      const f = woo[0];
      if (!f || (isRecord(f) && typeof f.name === 'string' && typeof f.permalink === 'string')) return 'woocommerce';
    }
  }
  return null;
}

const BLOCK_STATUS = new Set([401, 403, 429, 451, 503]);

export async function diagnoseSite(siteUrl: string): Promise<SiteDiagnosis> {
  let origin: string;
  try {
    const u = new URL(siteUrl);
    if (!/^https?:$/.test(u.protocol)) throw new Error('proto');
    origin = u.origin;
  } catch {
    return {
      verdict: 'invalid', reachable: false, platform: null, pagesFetched: 0, productsFound: 0,
      samples: [], signals: null,
      message: 'Geçersiz adres. Tam URL girin (http:// veya https:// ile).',
      hint: 'Örnek: https://magazaniz.com',
    };
  }

  // 1) Platform ürün beslemesi (en sağlam sinyal)
  const platform = await probePlatform(origin);
  if (platform) {
    return {
      verdict: 'ok', reachable: true, platform, pagesFetched: 1, productsFound: 0, samples: [], signals: null,
      message: (platform === 'shopify' ? 'Shopify' : 'WooCommerce') +
        ' ürün beslemesi bulundu — katalog eksiksiz ve hızlı taranır.',
      hint: 'Taramayı başlatabilirsin; ürünler API üzerinden çekilecek.',
    };
  }

  // 2) Anasayfa
  const home = await fetchWithStatus(siteUrl);
  if (BLOCK_STATUS.has(home.status)) {
    return {
      verdict: 'blocked', reachable: true, platform: null, pagesFetched: 1, productsFound: 0, samples: [], signals: null,
      message: 'Site otomatik erişimi engelledi (HTTP ' + home.status + '). Bot koruması tarayıcıyı durduruyor.',
      hint: 'Kendi siten için tarayıcı kimliğine (user-agent) izin ver ya da IP\'yi beyaz listeye al.',
    };
  }
  if (home.body == null) {
    return {
      verdict: 'unreachable', reachable: false, platform: null, pagesFetched: 0, productsFound: 0, samples: [], signals: null,
      message: 'Siteye ulaşılamadı (zaman aşımı veya bağlantı hatası).',
      hint: 'Adresin doğru ve sitenin çevrimiçi olduğundan emin ol.',
    };
  }

  const signals = htmlSignals(home.body);
  const samples: Array<{ name: string; url: string; price: number | null }> = [];
  const seen = new Set<string>();
  const collect = (prods: RawProduct[]) => {
    for (const p of prods) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      samples.push({ name: p.name, url: p.url, price: p.price ?? null });
    }
  };
  collect(extractProducts(home.body, siteUrl));

  // 3) Mini iki-seviyeli örnekleme: önce doğrudan ürün linkleri; ürün
  //    çözülemezse liste sayfalarına inip oradan ürün linki topla. Ayrıca
  //    "ürün sayfası linki" sayısını izle: gerçek tarayıcı (BFS) daha derine
  //    iner, o yüzden bol ürün linki tek başına "taranabilir" kanıtıdır — tek
  //    sayfayı ayrıştıramamak siteyi taranamaz yapmaz (koton gibi).
  const homeLinks = extractLinks(home.body, siteUrl);
  const productLinks = homeLinks.filter((u) => classifyUrl(u) === 'product');
  const listingLinks = homeLinks.filter((u) => classifyUrl(u) === 'listing');
  let productLinkCount = productLinks.length;

  let pagesFetched = 1;
  const tryProduct = async (u: string) => {
    if (pagesFetched >= PREFLIGHT_MAX_PAGES || samples.length >= 5) return;
    const html = await fetchText(u);
    pagesFetched++;
    if (html) collect(extractProducts(html, u));
  };

  for (const u of productLinks.slice(0, 3)) {
    if (samples.length >= 3) break;
    await tryProduct(u);
  }
  if (samples.length === 0) {
    for (const lu of listingLinks.slice(0, 2)) {
      if (pagesFetched >= PREFLIGHT_MAX_PAGES) break;
      const html = await fetchText(lu);
      pagesFetched++;
      if (!html) continue;
      collect(extractProducts(html, lu)); // liste sayfasında JSON-LD ItemList/Product olabilir
      const plinks = extractLinks(html, lu).filter((u) => classifyUrl(u) === 'product');
      if (plinks.length > productLinkCount) productLinkCount = plinks.length;
      for (const pu of plinks.slice(0, 2)) {
        if (pagesFetched >= PREFLIGHT_MAX_PAGES || samples.length >= 3) break;
        await tryProduct(pu);
      }
    }
  }

  const productsFound = samples.length;
  // Ürün çözüldü YA DA bol ürün linki var → taranabilir
  if (productsFound > 0 || productLinkCount >= 6) {
    return {
      verdict: 'ok', reachable: true, platform: null, pagesFetched, productsFound,
      samples: samples.slice(0, 5), signals,
      message: productsFound > 0
        ? productsFound + ' ürün sinyali okundu (JSON-LD/mikrodata/OpenGraph). Site taranabilir.'
        : productLinkCount + '+ ürün sayfası linki bulundu — site taranabilir (tam tarama ürünleri çözecek).',
      hint: 'Taramayı başlatabilirsin.',
    };
  }

  // Ürün yok — istemci-render (SPA) mı?
  const shell = signals.textRatio < 0.08 || signals.textLength < 500;
  const noStructured = !signals.hasJsonLdProduct && !signals.hasMicrodata && !signals.hasOgProduct;
  if (signals.spaMarkers.length && (shell || noStructured)) {
    return {
      verdict: 'spa_risk', reachable: true, platform: null, pagesFetched, productsFound: 0, samples: [], signals,
      message: 'Site içeriğini tarayıcıda JavaScript ile üretiyor gibi (' + signals.spaMarkers.join(', ') +
        '). Sunucu HTML\'inde ürün görünmüyor; tarama ürün bulamayabilir.',
      hint: 'Shopify/WooCommerce ürün beslemesi, ürün sayfalarına schema.org/Product JSON-LD ya da ' +
        'sunucu-render (SSR) önerilir. Hazır ürün feed\'in varsa onu bağlayabiliriz.',
    };
  }

  return {
    verdict: 'no_products', reachable: true, platform: null, pagesFetched, productsFound: 0, samples: [], signals,
    message: 'Siteye ulaşıldı ama tanınan ürün verisi (JSON-LD/mikrodata/OpenGraph/fiyat) bulunamadı.',
    hint: 'Ürün sayfalarına schema.org/Product JSON-LD eklemek en güvenilir yoldur.',
  };
}
