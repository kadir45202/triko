// AI öneri motoru (Faz 5). Spec gereği AI yalnızca "bunları da seversin"
// bölümü içindir — kombin önerileri uzman girdisi olarak kalır.
// ANTHROPIC_API_KEY tanımlıysa claude-haiku-4-5 (spec'in maliyet tercihi)
// kullanılır; yoksa aynı sözleşmeyle kural bazlı fallback çalışır.
import Anthropic from '@anthropic-ai/sdk';

export type ProductLite = {
  id: string;
  name: string;
  category?: string | null;
  color?: string | null;
  price?: number | null;
};

export type Recommendation = { productId: string; reason: string };

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['productId', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
} as const;

function priceRange(p?: number | null): string {
  if (!p) return 'bilinmiyor';
  if (p < 1000) return 'ekonomik';
  if (p < 2500) return 'orta';
  return 'premium';
}

function describe(p: ProductLite): string {
  return '- ' + p.name + ' (id: ' + p.id + ', ' + (p.category || '?') + ', ' +
    (p.color || 'renk belirsiz') + ', ' + priceRange(p.price) + ')';
}

// Spec'teki kurallar: renk/fiyat uyumu, bakılmamış ürün, kategori başına max 2
function sanitize(recs: Recommendation[], viewed: ProductLite[], catalog: ProductLite[]): Recommendation[] {
  const viewedIds = new Set(viewed.map((v) => v.id));
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const perCategory: Record<string, number> = {};
  const out: Recommendation[] = [];
  for (const r of recs) {
    const p = byId.get(r.productId);
    if (!p || viewedIds.has(p.id)) continue;
    const cat = p.category || '?';
    if ((perCategory[cat] || 0) >= 2) continue;
    perCategory[cat] = (perCategory[cat] || 0) + 1;
    out.push({ productId: p.id, reason: String(r.reason).slice(0, 60) });
    if (out.length >= 4) break;
  }
  return out;
}

export function ruleBasedRecommend(viewed: ProductLite[], catalog: ProductLite[]): Recommendation[] {
  const colors: Record<string, number> = {};
  const cats: Record<string, number> = {};
  let priceSum = 0;
  let priceCount = 0;
  for (const v of viewed) {
    if (v.color) colors[v.color] = (colors[v.color] || 0) + 1;
    if (v.category) cats[v.category] = (cats[v.category] || 0) + 1;
    if (v.price) { priceSum += v.price; priceCount++; }
  }
  const avgPrice = priceCount ? priceSum / priceCount : null;

  const scored = catalog
    .filter((p) => !viewed.some((v) => v.id === p.id))
    .map((p) => {
      let score = 0;
      const reasons: string[] = [];
      if (p.color && colors[p.color]) { score += 2; reasons.push(p.color + ' sevdiğin renk'); }
      if (p.category && cats[p.category]) { score += 1; reasons.push('tarzına uygun'); }
      if (avgPrice && p.price && Math.abs(p.price - avgPrice) / avgPrice < 0.5) {
        score += 1; reasons.push('bütçene uygun');
      }
      return { p, score, reason: reasons[0] || 'sana yakışır' };
    })
    .sort((a, b) => b.score - a.score);

  return sanitize(
    scored.map((s) => ({ productId: s.p.id, reason: s.reason })),
    viewed,
    catalog,
  );
}

async function aiRecommend(viewed: ProductLite[], catalog: ProductLite[]): Promise<Recommendation[]> {
  const client = new Anthropic();
  const prompt =
    'Sen bir moda stil asistanısın.\n' +
    'Kullanıcı bu oturumda şu ürünlere baktı:\n' +
    viewed.map(describe).join('\n') +
    '\n\nMevcut ürün kataloğu:\n' +
    catalog.map(describe).join('\n') +
    '\n\nBu ürünlere bakma kalıbından kullanıcının stil tercihlerini çıkar.\n' +
    'Katalogdan şu kriterlere göre 4 ürün öner:\n' +
    '- Kullanıcının renk tercihine uygun\n' +
    '- Fiyat aralığına yakın\n' +
    '- Daha önce bakmadığı ürünler\n' +
    '- Aynı kategoriden en fazla 2 öneri\n' +
    'productId alanında katalogdaki id değerini kullan; reason kısa Türkçe gerekçe (max 4 kelime).';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return [];
  const parsed = JSON.parse(block.text) as { recommendations: Recommendation[] };
  return sanitize(parsed.recommendations, viewed, catalog);
}

export async function recommend(
  viewed: ProductLite[],
  catalog: ProductLite[],
): Promise<{ source: 'ai' | 'rules'; recommendations: Recommendation[] }> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const recs = await aiRecommend(viewed, catalog);
      if (recs.length) return { source: 'ai', recommendations: recs };
    } catch {
      // AI hatasında sessizce kural bazlıya düş — widget deneyimi bozulmasın
    }
  }
  return { source: 'rules', recommendations: ruleBasedRecommend(viewed, catalog) };
}
