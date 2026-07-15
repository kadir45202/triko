// URL eşleştirme — combo'nun triggerUrlPattern'i ile widget'ın bildirdiği sayfa
// URL'si arasındaki ANLAMSIZ farkları (protokol, www, sonda /, izleme
// parametreleri, fragment) eleyerek "sessiz kaçırma"yı (#6) önler.
//
// Ajanın kurduğu kombinlerde triggerUrlPattern = escapeRegex(ürün URL'si), yani
// tam bir URL'in kaçışlanmış hâlidir. Bunu geri açıp iki tarafı da normalize bir
// "anahtara" indirip karşılaştırırız: hem trailing-slash/www farkını yakalar hem
// de alt-dize taşmasını (…/urun/5 pattern'inin …/urun/50 sayfasına uyması) keser.
// Elle girilen kısmi kalıplar (ör. "urun.html?id=x") URL'e çözülemez; onlarda
// eski regex/alt-dize davranışı korunur.

// Ürünü tanımlayan, korunması gereken query parametreleri (izleme değil, kimlik)
const KEEP_QUERY = ['id', 'sku', 'p', 'pid', 'product_id', 'productid', 'urun', 'variant'];

// Bir URL'i karşılaştırılabilir kanonik anahtara indir. URL değilse null.
export function urlKey(raw: string): string | null {
  let s = (raw || '').trim();
  if (!s) return null;
  if (s.startsWith('//')) s = 'https:' + s; // protokolsüz mutlak URL
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const qs: string[] = [];
    for (const k of KEEP_QUERY) {
      const v = u.searchParams.get(k);
      if (v) qs.push(k + '=' + v);
    }
    qs.sort();
    return host + path + (qs.length ? '?' + qs.join('&') : '');
  } catch {
    return null;
  }
}

// escapeRegex'in eklediği kaçış ters-eğik çizgilerini kaldır (ham metni geri al)
function unescapeRegexLiteral(pattern: string): string {
  return pattern.replace(/\\(.)/g, '$1');
}

// Combo trigger kalıbı verilen sayfa URL'siyle eşleşiyor mu?
export function urlMatches(pattern: string, url: string): boolean {
  if (!pattern) return true;
  const key = urlKey(unescapeRegexLiteral(pattern));
  if (key) {
    // Kalıp tam bir URL — kesin (normalize) eşitlik. Alt-dize taşmasını önler.
    const target = urlKey(url);
    return !!target && key === target;
  }
  // Kalıp tam URL değil (kısmi/elle/regex) — geriye dönük uyumlu davranış.
  try {
    return new RegExp(pattern).test(url);
  } catch {
    return url.includes(pattern);
  }
}
