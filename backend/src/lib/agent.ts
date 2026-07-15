// Katalog ajanı (Faz A + B): siteyi keşfeder, ürünleri anlar, kombinleri kurar.
// Kaba işler (platform API, sayfa indirme, JSON-LD) crawler.ts'te deterministik;
// bu modül anlama/karar noktalarında Claude'u çağırır. ANTHROPIC_API_KEY
// yoksa aynı sözleşmeyle kural bazlı fallback çalışır (recommend.ts deseni).
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';
import { cacheDel } from './cache';
import { MAX_PAGES, RawProduct, crawlSite, extractProducts, fetchPlatformProducts } from './crawler';
import { planLimits } from './plan';

const MODEL = 'claude-haiku-4-5'; // spec'in maliyet tercihi (recommend.ts ile aynı)

// ---------- ajan aktivite akışı ----------

export async function logAgent(
  customerId: string,
  type: string,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await prisma.agentEvent.create({
      data: { customerId, type, message, meta: JSON.stringify(meta) },
    });
  } catch {
    // aktivite kaydı asla ana akışı düşürmesin
  }
}

// ---------- tarama durumu (in-memory; tek instance dev kurulumu için yeterli) ----------

export type ScanStatus = {
  state: 'running' | 'done' | 'error';
  step: string;
  pagesScanned: number;
  productsFound: number;
  productsNew: number;
  combosCreated: number;
  pages: string[]; // taranan sayfa URL'leri (canlı izleme + geçmiş için)
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

const MAX_TRACKED_PAGES = 300; // panelde gösterilecek/saklanacak URL üst sınırı

const scanJobs = new Map<string, ScanStatus>();

export function getScanStatus(customerId: string): ScanStatus | null {
  return scanJobs.get(customerId) || null;
}

export function isScanRunning(customerId: string): boolean {
  return scanJobs.get(customerId)?.state === 'running';
}

// Canlı (bellek) durum yoksa son taramayı DB'den (ScanRun) getir — durum sunucu
// yeniden başlasa da kaybolmaz, panel geçmişi tutarlı gösterir (#4).
export async function latestScanStatus(customerId: string): Promise<ScanStatus | null> {
  const mem = scanJobs.get(customerId);
  if (mem) return mem;
  const run = await prisma.scanRun.findFirst({
    where: { customerId },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) return null;
  let pages: string[] = [];
  try { pages = JSON.parse(run.pages || '[]'); } catch { /* bozuk kayıt boş liste */ }
  const state: ScanStatus['state'] = run.state === 'running' ? 'running' : run.state === 'error' ? 'error' : 'done';
  return {
    state,
    step: state === 'done' ? 'Tamamlandı' : state === 'error' ? 'Hata: ' + (run.error || 'bilinmiyor') : 'Devam ediyor',
    pagesScanned: run.pagesScanned,
    productsFound: run.productsFound,
    productsNew: run.productsNew,
    combosCreated: run.combosCreated,
    pages,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : undefined,
    error: run.error || undefined,
  };
}

// Açılışta: önceki süreç çökmeden/yeniden başlamadan önce "running" kalmış
// taramaları toparla (bellek durumu gittiği için asla bitmezler). #4 dayanıklılık.
export async function recoverStuckScans(): Promise<number> {
  const r = await prisma.scanRun.updateMany({
    where: { state: 'running' },
    data: { state: 'error', error: 'interrupted_restart', finishedAt: new Date() },
  });
  return r.count;
}

// ---------- zenginleştirme ----------

export type EnrichResult = {
  category: string;
  color: string | null;
  styleTags: string[];
  season: string;
};

const CATEGORIES = ['ust-giyim', 'alt-giyim', 'elbise', 'dis-giyim', 'ayakkabi', 'canta', 'aksesuar'];

// Sıra önemli: ilk eşleşen kazanır. Giysi kategorileri aksesuardan ÖNCE
// gelir ki "Kemerli Pantolon" gibi sıfatlar ürünü aksesuar yapmasın; aksesuar
// en sonda "son çare" olarak durur. Üst giyim, alt giyimden önce gelir ki
// "Jean Bluz" (denim üst) alt-giyim değil ust-giyim sınıflansın.
const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/elbise|tulum|gecelik|abiye/i, 'elbise'],
  [/trençkot|trenckot|ceket|blazer|mont|kaban|hırka|hirka|palto|yağmurluk|yagmurluk/i, 'dis-giyim'],
  [/stiletto|topuklu|sneaker|ayakkabı|ayakkabi|bot|çizme|cizme|sandalet|loafer|babet|terlik/i, 'ayakkabi'],
  [/çanta|canta|clutch|sırt çantası|tote|cüzdan|cuzdan/i, 'canta'],
  [/gömlek|gomlek|bluz|tişört|tisort|t-shirt|kazak|sweatshirt|süveter|suveter|triko|body|badi|büstiyer|bustiyer|korse|bralet|atlet|sütyen|sutyen|kaşkorse|kaskorse|halter|crop|top\b|(^|\s)üst|süveter/i, 'ust-giyim'],
  [/jean|jeans|kot\b|pantolon|etek|şort|sort|jort|bermuda|tayt|eşofman|jogger|culotte|palazzo|külot|kulot|pantalon/i, 'alt-giyim'],
  [/şapka|sapka|gözlük|gozluk|\bsaat\b|\bkemer\b|fular|takı|taki|küpe|kupe|kolye|atkı|atki|bere|eldiven|bileklik|broş|bros|şal\b/i, 'aksesuar'],
];

const COLOR_WORDS = [
  'siyah', 'beyaz', 'bej', 'gri', 'kırmızı', 'kirmizi', 'mavi', 'lacivert', 'yeşil', 'yesil',
  'sarı', 'sari', 'mor', 'pembe', 'kahverengi', 'bordo', 'turuncu', 'krem', 'ekru', 'mercan', 'haki', 'gül', 'gul',
];

// ASCII slug varyantlarını kanonik Türkçe renge indir (yesil→yeşil) ki
// farklı kaynaklardan gelen renkler kombin puanlamasında eşleşsin.
const COLOR_CANON: Record<string, string> = {
  yesil: 'yeşil', kirmizi: 'kırmızı', sari: 'sarı', gul: 'gül',
};

// Rengi ürün adı veya URL slug'ından deterministik çıkar. Koton gibi siteler
// rengi URL'de yazar (…-saten-klos-etek-yesil-4017811/) ama isimde geçmez —
// AI/kural bunu kaçırır, bu yüzden token bazlı güvenilir bir yedek.
function colorFromText(text: string): string | null {
  const hay = ' ' + text.toLowerCase().replace(/[^a-zçğıöşü]+/gi, ' ') + ' ';
  for (const c of COLOR_WORDS) {
    if (hay.indexOf(' ' + c + ' ') !== -1) return COLOR_CANON[c] || c;
  }
  return null;
}

function ruleEnrich(name: string, rawCategory?: string | null): EnrichResult {
  const hay = (name + ' ' + (rawCategory || '')).toLowerCase();
  let category = 'aksesuar';
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(hay)) { category = cat; break; }
  }
  const color = COLOR_WORDS.find((c) => hay.includes(c)) || null;
  const styleTags: string[] = [];
  if (/gece|davet|saten|stiletto|abiye/i.test(hay)) styleTags.push('gece');
  if (/blazer|gömlek|gomlek|ofis|klasik|poplin/i.test(hay)) styleTags.push('ofis');
  if (/tişört|tisort|jean|sneaker|şapka|sapka|sweatshirt|basic/i.test(hay)) styleTags.push('casual');
  if (/spor|eşofman|tayt/i.test(hay)) styleTags.push('spor');
  if (/hasır|hasir|plaj|bikini|şort|sort/i.test(hay)) styleTags.push('plaj');
  if (!styleTags.length) styleTags.push('casual');
  const season = /hasır|hasir|plaj|şort|sort|sandalet|bikini/i.test(hay)
    ? 'yaz'
    : /mont|kaban|kazak|bere|atkı|atki|eldiven|palto/i.test(hay)
      ? 'kis'
      : 'mevsimlik';
  return { category, color, styleTags, season };
}

const ENRICH_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          externalId: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          color: { type: ['string', 'null'] },
          styleTags: { type: 'array', items: { type: 'string' } },
          season: { type: 'string', enum: ['yaz', 'kis', 'mevsimlik'] },
        },
        required: ['externalId', 'category', 'color', 'styleTags', 'season'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

type EnrichInput = { externalId: string; name: string; rawCategory?: string | null; price?: number | null; url?: string };

async function aiEnrich(items: EnrichInput[]): Promise<Map<string, EnrichResult>> {
  const client = new Anthropic();
  const prompt =
    'Sen bir moda kataloğu editörüsün. Aşağıdaki ürünleri sınıflandır.\n' +
    'Kategoriler: ' + CATEGORIES.join(', ') + '\n' +
    'category: ürün adına göre en doğru kategori (ör. "Askılı Üst"/"Bluz" → ust-giyim).\n' +
    'color: ürünün baskın rengi Türkçe küçük harf; ad veya URL slug\'ında renk geçiyorsa onu kullan (bilinmiyorsa null).\n' +
    'styleTags: casual/ofis/gece/spor/plaj arasından 1-3 etiket.\n' +
    'season: yaz/kis/mevsimlik.\n\nÜrünler:\n' +
    items
      .map((p) => `- externalId: ${p.externalId} | ad: ${p.name} | site kategorisi: ${p.rawCategory || '?'} | url: ${p.url || '?'}`)
      .join('\n');
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    output_config: { format: { type: 'json_schema', schema: ENRICH_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = response.content.find((b) => b.type === 'text');
  const out = new Map<string, EnrichResult>();
  if (block && block.type === 'text') {
    const parsed = JSON.parse(block.text) as { items: Array<EnrichResult & { externalId: string }> };
    for (const it of parsed.items) {
      out.set(it.externalId, {
        category: CATEGORIES.includes(it.category) ? it.category : ruleEnrich('').category,
        color: it.color ? String(it.color).toLowerCase().slice(0, 30) : null,
        styleTags: (it.styleTags || []).slice(0, 3).map((t) => String(t).toLowerCase().slice(0, 20)),
        season: ['yaz', 'kis', 'mevsimlik'].includes(it.season) ? it.season : 'mevsimlik',
      });
    }
  }
  return out;
}

// Zenginleştirilmemiş ürünleri toplu işle (AI varsa 20'lik partiler, yoksa kurallar)
export async function enrichPending(customerId: string): Promise<number> {
  const pending = await prisma.product.findMany({
    where: { customerId, enriched: false, status: 'active' },
    take: 200,
  });
  if (!pending.length) return 0;

  let enrichedCount = 0;
  const useAI = !!process.env.ANTHROPIC_API_KEY;
  for (let i = 0; i < pending.length; i += 20) {
    const batch = pending.slice(i, i + 20);
    let results = new Map<string, EnrichResult>();
    if (useAI) {
      try {
        results = await aiEnrich(batch);
      } catch {
        results = new Map(); // AI hatasında bu parti kurallarla işlenir
      }
    }
    for (const p of batch) {
      const r = results.get(p.externalId) || ruleEnrich(p.name, p.rawCategory);
      // Renk boşsa ad + URL slug'ından deterministik doldur (en güvenilir sinyal)
      const color = r.color || colorFromText(p.name + ' ' + (p.url || ''));
      await prisma.product.update({
        where: { id: p.id },
        data: {
          category: r.category,
          color,
          styleTags: JSON.stringify(r.styleTags),
          season: r.season,
          enriched: true,
        },
      });
      enrichedCount++;
    }
  }
  if (enrichedCount) {
    await logAgent(customerId, 'product_enriched', enrichedCount + ' ürün kategorize edildi', {
      count: enrichedCount, source: useAI ? 'ai' : 'rules',
    });
  }
  return enrichedCount;
}

// ---------- kombin üretimi ----------

type ProductRow = {
  id: string; externalId: string; url: string; name: string;
  price: number | null; imageUrl: string | null;
  category: string | null; color: string | null; styleTags: string;
  season?: string | null;
};

// Hangi kategori hangi kategoriyle kombinlenir
const COMPLEMENTS: Record<string, string[]> = {
  'elbise': ['ayakkabi', 'canta', 'aksesuar', 'dis-giyim'],
  'ust-giyim': ['alt-giyim', 'dis-giyim', 'aksesuar'],
  'alt-giyim': ['ust-giyim', 'ayakkabi'],
  'dis-giyim': ['ust-giyim', 'elbise', 'aksesuar'],
  'ayakkabi': ['elbise', 'alt-giyim'],
  'canta': ['elbise', 'dis-giyim'],
  'aksesuar': ['elbise', 'ust-giyim', 'dis-giyim'],
};

const NEUTRALS = new Set(['siyah', 'beyaz', 'bej', 'gri', 'krem', 'ekru', 'lacivert']);

function parseTags(json: string): string[] {
  try {
    const t = JSON.parse(json) as unknown;
    return Array.isArray(t) ? (t as string[]) : [];
  } catch {
    return [];
  }
}

function shareTag(a: string, b: string): boolean {
  const ta = new Set(parseTags(a));
  return parseTags(b).some((t) => ta.has(t));
}

// Formalite seviyesi: bir gece elbisesinin yanına spor ayakkabı önermeyelim.
// gece/ofis → şık; spor/plaj → günlük; diğerleri nötr (her ikisiyle de gider).
function formalityOf(styleTagsJson: string): 'sik' | 'gunluk' | 'notr' {
  const tags = parseTags(styleTagsJson);
  if (tags.includes('gece') || tags.includes('ofis')) return 'sik';
  if (tags.includes('spor') || tags.includes('plaj')) return 'gunluk';
  return 'notr';
}

export type ComboPlan = { baseId: string; suggestId: string; text: string };

const TEXT_TEMPLATES = [
  (s: string) => 'Bu parçaya ' + s + ' çok yakışır — birlikte dene! ✨',
  (s: string) => s + ' ile bu ikili kombinin yıldızı olur!',
  (s: string) => 'Stil ipucu: yanına ' + s + ' ekle, görünüm tamamlansın!',
  (s: string) => s + ' bu kombini bir üst seviyeye taşır 👌',
];

// Bir kombin adayını puanla. Yüksek = daha uyumlu. Yalnız kategori+renk değil;
// formalite ve mevsim tutarlılığını da tartar ve uyumsuzlukları cezalandırır ki
// "şık mı" kararı verilebilsin (zayıf/çelişkili kombinler eşiğin altında elenir).
function scorePair(base: ProductRow, p: ProductRow): number {
  let score = 2; // geçerli tamamlayıcı kategori tabanı
  // renk uyumu
  if (base.color && p.color === base.color) score += 2;
  else if (p.color && NEUTRALS.has(p.color)) score += 1;
  // stil etiketi ortaklığı
  if (shareTag(base.styleTags, p.styleTags)) score += 2;
  // formalite: aynı seviye güçlü artı, zıt (şık↔günlük) ağır ceza
  const fb = formalityOf(base.styleTags);
  const fp = formalityOf(p.styleTags);
  if (fb !== 'notr' && fp !== 'notr') score += fb === fp ? 2 : -4;
  // mevsim: aynı artı, zıt (yaz↔kış) ceza; mevsimlik nötr
  const sb = base.season;
  const sp = p.season;
  if (sb && sp && sb !== 'mevsimlik' && sp !== 'mevsimlik') score += sb === sp ? 1 : -3;
  // benzer fiyat segmenti (aşırı uçuruma düşme)
  if (base.price && p.price && Math.abs(p.price - base.price) / base.price < 1) score += 1;
  return score;
}

const COMBO_SCORE_FLOOR = 3; // tabanın (2) üstünde en az bir olumlu sinyal şart

export function ruleBasedCombos(products: ProductRow[], maxPerBase = 2): ComboPlan[] {
  const plans: ComboPlan[] = [];
  let t = 0;
  for (const base of products) {
    const wanted = COMPLEMENTS[base.category || ''] || [];
    if (!wanted.length) continue;
    const scored = products
      .filter((p) => p.id !== base.id && p.category && wanted.includes(p.category))
      .map((p) => ({ p, score: scorePair(base, p) }))
      .filter((x) => x.score >= COMBO_SCORE_FLOOR) // zayıf/uyumsuz kombinleri ele
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerBase);
    for (const { p } of scored) {
      plans.push({ baseId: base.id, suggestId: p.id, text: TEXT_TEMPLATES[t++ % TEXT_TEMPLATES.length](p.name) });
    }
  }
  return plans;
}

const COMBO_SCHEMA = {
  type: 'object',
  properties: {
    combos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          baseId: { type: 'string' },
          suggestId: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['baseId', 'suggestId', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['combos'],
  additionalProperties: false,
} as const;

async function aiCombos(products: ProductRow[]): Promise<ComboPlan[]> {
  const client = new Anthropic();
  const lines = products.map(
    (p) =>
      `- id: ${p.id} | ${p.name} | ${p.category} | ${p.color || '?'} | ${p.styleTags} | ${p.season || '?'} | ${p.price ?? '?'} TL`,
  );
  const prompt =
    'Sen bir moda stilistisin. Aşağıdaki katalogdan kombin önerileri üret.\n' +
    'Katalog satırı: id | ad | kategori | renk | stil etiketleri | mevsim | fiyat\n' +
    'Kurallar:\n' +
    '- baseId: müşterinin baktığı ürün, suggestId: yanına önerilecek TAMAMLAYICI ürün.\n' +
    '- Aynı kategoriden iki ürünü asla eşleştirme (elbise+elbise olmaz).\n' +
    '- Renk ve stil uyumuna dikkat et (nötr renkler her şeyle gider).\n' +
    '- FORMALİTE tutarlı olsun: şık/gece parçayı spor parçayla eşleştirme (gece elbisesi + spor ayakkabı OLMAZ).\n' +
    '- MEVSİM tutarlı olsun: yazlık parçayı kışlık parçayla eşleştirme (şort + kaban olmaz).\n' +
    '- Zorlama; gerçekten yakışmayan bir eş yoksa o ürün için öneri üretme (kaliteyi say, sayıyı değil).\n' +
    '- Her base için en fazla 2 öneri; toplam en fazla ' + Math.min(products.length * 2, 40) + ' kombin.\n' +
    '- text: maskotun söyleyeceği enerjik, samimi Türkçe cümle (max 90 karakter, 1 emoji serbest).\n\nKatalog:\n' +
    lines.join('\n');
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: { format: { type: 'json_schema', schema: COMBO_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return [];
  return (JSON.parse(block.text) as { combos: ComboPlan[] }).combos;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatPrice(price: number | null, currency: string | null): string {
  if (price == null) return '';
  const sym = !currency || currency === 'TRY' ? '₺' : currency + ' ';
  return sym + price.toLocaleString('tr-TR');
}

// Plan → Combo satırları. Var olan (aynı base ürün + aynı önerilen URL) kombinler atlanır.
// autoPublishCombos kapalıysa kombinler "pending" düşer: widget'a çıkmaz,
// editör Onay Kuyruğu'ndan önizleyip yayınlar.
export async function materializeCombos(customerId: string, plans: ComboPlan[]): Promise<number> {
  if (!plans.length) return 0;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { autoPublishCombos: true },
  });
  const autoPublish = customer?.autoPublishCombos ?? true;
  const products = await prisma.product.findMany({ where: { customerId } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const existing = await prisma.combo.findMany({
    where: { customerId },
    select: { triggerProductId: true, suggestedProductUrl: true },
  });
  const existingKeys = new Set(existing.map((c) => c.triggerProductId + '→' + c.suggestedProductUrl));

  const perBase: Record<string, number> = {};
  let created = 0;
  for (const plan of plans) {
    const base = byId.get(plan.baseId);
    const suggest = byId.get(plan.suggestId);
    if (!base || !suggest || base.id === suggest.id) continue;
    if (base.category && suggest.category && base.category === suggest.category) continue;
    if ((perBase[base.id] || 0) >= 2) continue;
    const key = base.externalId + '→' + suggest.url;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    perBase[base.id] = (perBase[base.id] || 0) + 1;

    await prisma.combo.create({
      data: {
        customerId,
        triggerUrlPattern: escapeRegex(base.url),
        triggerProductId: base.externalId,
        suggestedProductName: suggest.name,
        suggestedProductPrice: formatPrice(suggest.price, suggest.currency),
        suggestedProductUrl: suggest.url,
        suggestedProductImageOriginal: suggest.imageUrl,
        mascotText: String(plan.text).slice(0, 120),
        expertNote: 'Triko ajanı otomatik oluşturdu',
        priority: 0,
        status: autoPublish ? 'published' : 'pending',
        source: 'agent',
      },
    });
    created++;
  }
  if (created) {
    await logAgent(
      customerId,
      'combo_created',
      created + (autoPublish ? ' yeni kombin oluşturuldu ve yayınlandı' : ' yeni kombin onay kuyruğuna eklendi'),
      { count: created, autoPublish },
    );
    if (autoPublish) await invalidateWidgetCache(customerId);
  }
  return created;
}

async function invalidateWidgetCache(customerId: string) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { token: true } });
  if (c) await cacheDel('wcfg:' + c.token);
}

// Katalog genelinde kombin üretimi (AI varsa AI, yoksa kurallar; her durumda sanitize edilir)
export async function generateCombos(customerId: string): Promise<number> {
  const products = (await prisma.product.findMany({
    where: { customerId, status: 'active', enriched: true },
    take: 200,
  })) as ProductRow[];
  if (products.length < 2) return 0;

  let plans: ComboPlan[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      plans = await aiCombos(products);
    } catch {
      plans = [];
    }
  }
  if (!plans.length) plans = ruleBasedCombos(products);
  return materializeCombos(customerId, plans);
}

// ---------- ürün kaydı (crawl + pasif ingest ortak yolu) ----------

export async function upsertProduct(
  customerId: string,
  raw: RawProduct,
  source: 'crawl' | 'jsonld',
  opts: { capReached?: boolean } = {},
): Promise<{ id: string; isNew: boolean; skipped?: boolean }> {
  const existing = await prisma.product.findUnique({
    where: { customerId_externalId: { customerId, externalId: raw.externalId } },
  });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: raw.name,
        url: raw.url,
        price: raw.price ?? existing.price,
        currency: raw.currency || existing.currency,
        imageUrl: raw.imageUrl ?? existing.imageUrl,
        rawCategory: raw.rawCategory ?? existing.rawCategory,
        status: 'active',
      },
    });
    return { id: existing.id, isNew: false };
  }
  // Plan ürün kotası dolduysa YENİ ürün eklenmez (mevcutlar güncellenmeye devam eder)
  if (opts.capReached) return { id: '', isNew: false, skipped: true };
  const created = await prisma.product.create({
    data: {
      customerId,
      externalId: raw.externalId,
      url: raw.url,
      name: raw.name,
      price: raw.price ?? null,
      currency: raw.currency || 'TRY',
      imageUrl: raw.imageUrl ?? null,
      rawCategory: raw.rawCategory ?? null,
      source,
    },
  });
  await logAgent(customerId, 'product_found', 'Yeni ürün keşfedildi: ' + raw.name, {
    externalId: raw.externalId, source,
  });
  return { id: created.id, isNew: true };
}

// Faz B: yeni ürün görüldüğünde tekil zenginleştirme + kombin güncellemesi
export async function handleNewProduct(customerId: string): Promise<void> {
  await enrichPending(customerId);
  await generateCombos(customerId);
}

// ---------- Faz A: tam site taraması ----------

export async function runScan(
  customerId: string,
  siteUrl: string,
  trigger: 'manual' | 'scheduled' = 'manual',
): Promise<void> {
  if (isScanRunning(customerId)) return;
  const status: ScanStatus = {
    state: 'running',
    step: 'Keşif başlıyor',
    pagesScanned: 0,
    productsFound: 0,
    productsNew: 0,
    combosCreated: 0,
    pages: [],
    startedAt: new Date().toISOString(),
  };
  scanJobs.set(customerId, status);
  const run = await prisma.scanRun.create({
    data: { customerId, siteUrl, trigger },
  });
  let productsRemoved = 0;
  await logAgent(customerId, 'scan_started', 'Site taraması başladı: ' + siteUrl, { siteUrl, trigger });

  // Plan ürün kotası: yeni ürün eklemeyi üst sınırda durdur (mevcutlar güncellenir).
  const capCustomer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { plan: true, planExpiresAt: true },
  });
  const productCap = capCustomer ? planLimits(capCustomer).maxProducts : Infinity;
  let activeCount = await prisma.product.count({ where: { customerId, status: 'active' } });
  let productsCapped = 0;

  try {
    const seenExternalIds = new Set<string>();
    let crawlComplete = false;

    // 1. kanal: platform ürün API'si (Shopify/WooCommerce). Uç varsa katalog
    // birkaç istekle eksiksiz gelir; sayfa sayfa gezmeye gerek kalmaz.
    status.step = 'Mağaza altyapısı yoklanıyor (ürün API uçları)';
    const platform = await fetchPlatformProducts(siteUrl);

    if (platform) {
      status.pagesScanned = platform.requests;
      status.pages = platform.urls.slice(0, MAX_TRACKED_PAGES);
      await logAgent(
        customerId,
        'platform_detected',
        (platform.platform === 'shopify' ? 'Shopify' : 'WooCommerce') +
          ' ürün API\'si bulundu: ' + platform.products.length + ' ürün',
        { platform: platform.platform, count: platform.products.length },
      );
      for (const raw of platform.products) {
        status.productsFound++;
        status.step = status.productsFound + ' ürün işlendi (' + platform.platform + ' API)';
        const { isNew, skipped } = await upsertProduct(customerId, raw, 'crawl', { capReached: activeCount >= productCap });
        if (skipped) { productsCapped++; continue; }
        seenExternalIds.add(raw.externalId);
        if (isNew) { status.productsNew++; activeCount++; }
      }
      // API kataloğun tamamını verdi → görünmeyen ürünler gerçekten kalkmış
      crawlComplete = true;
    } else {
      // 2. kanal: BFS link takibi — ajan siteyi bir ziyaretçi gibi gezer
      status.step = 'Site linkleri adım adım geziliyor';
      const crawl = await crawlSite(siteUrl, async (pageUrl, html) => {
        status.pagesScanned++;
        if (status.pages.length < MAX_TRACKED_PAGES) status.pages.push(pageUrl);
        status.step = status.pagesScanned + ' sayfa tarandı, ' + status.productsFound + ' ürün görüldü';
        const found = extractProducts(html, pageUrl);
        for (const raw of found) {
          status.productsFound++;
          const { isNew, skipped } = await upsertProduct(customerId, raw, 'crawl', { capReached: activeCount >= productCap });
          if (skipped) { productsCapped++; continue; }
          seenExternalIds.add(raw.externalId);
          if (isNew) { status.productsNew++; activeCount++; }
        }
      });
      // Hiç sayfa çekilemedi → adres yanlış ya da site erişilemez
      if (crawl.pagesFetched === 0) throw new Error('site_unreachable');

      // Tarama sayfa bütçesine takıldıysa (site tamamen gezilemedi) ürün
      // düşürme atlanır — görülmeyen ürün "kaldırıldı" demek değildir.
      crawlComplete = crawl.queued <= status.pagesScanned || status.pagesScanned < MAX_PAGES;
    }

    // Sitede artık görünmeyen (daha önce crawl ile bulunmuş) ürünleri düşür.
    if (seenExternalIds.size && crawlComplete) {
      const gone = await prisma.product.findMany({
        where: { customerId, source: 'crawl', status: 'active', externalId: { notIn: [...seenExternalIds] } },
      });
      for (const p of gone) {
        await prisma.product.update({ where: { id: p.id }, data: { status: 'removed' } });
        productsRemoved++;
        const closed = await prisma.combo.updateMany({
          where: { customerId, isActive: true, OR: [{ suggestedProductUrl: p.url }, { triggerProductId: p.externalId }] },
          data: { isActive: false },
        });
        await logAgent(customerId, 'product_removed', 'Ürün siteden kaldırıldı: ' + p.name, {
          externalId: p.externalId, closedCombos: closed.count,
        });
      }
      if (gone.length) await invalidateWidgetCache(customerId);
    }

    if (productsCapped > 0) {
      await logAgent(customerId, 'plan_limit',
        productsCapped + ' ürün plan sınırına (' + productCap + ') takıldı ve eklenmedi',
        { cap: productCap, capped: productsCapped });
    }

    status.step = 'Ürünler kategorize ediliyor';
    await enrichPending(customerId);

    status.step = 'Kombinler kuruluyor';
    status.combosCreated = await generateCombos(customerId);

    status.state = 'done';
    status.step = 'Tamamlandı';
    status.finishedAt = new Date().toISOString();
    await prisma.scanRun.update({
      where: { id: run.id },
      data: {
        state: 'done',
        pagesScanned: status.pagesScanned,
        productsFound: status.productsFound,
        productsNew: status.productsNew,
        productsRemoved,
        combosCreated: status.combosCreated,
        pages: JSON.stringify(status.pages),
        finishedAt: new Date(),
      },
    });
    await logAgent(
      customerId,
      'scan_finished',
      `Tarama bitti: ${status.pagesScanned} sayfa, ${status.productsNew} yeni ürün, ${status.combosCreated} yeni kombin`,
      { ...status, pages: undefined }, // URL listesi ScanRun'da; aktivite meta'sını şişirme
    );
  } catch (err) {
    status.state = 'error';
    status.error = err instanceof Error ? err.message : 'unknown';
    status.finishedAt = new Date().toISOString();
    await prisma.scanRun
      .update({
        where: { id: run.id },
        data: {
          state: 'error',
          error: status.error,
          pagesScanned: status.pagesScanned,
          productsFound: status.productsFound,
          productsNew: status.productsNew,
          productsRemoved,
          combosCreated: status.combosCreated,
          pages: JSON.stringify(status.pages),
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
    await logAgent(customerId, 'error', 'Tarama hatası: ' + status.error, {});
  }
}

// Faz B aktif kısım: siteUrl'i olan tüm müşteriler için periyodik fark taraması
export async function rescanAll(): Promise<void> {
  const customers = await prisma.customer.findMany({
    where: { siteUrl: { not: null } },
    select: { id: true, siteUrl: true, plan: true, planExpiresAt: true },
  });
  for (const c of customers) {
    // Periyodik fark taraması yalnız izin veren planlarda (STARTER'da kapalı)
    if (!planLimits(c).periodicRescan) continue;
    if (c.siteUrl && !isScanRunning(c.id)) await runScan(c.id, c.siteUrl, 'scheduled');
  }
}
