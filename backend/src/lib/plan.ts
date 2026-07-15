// Plan/limit katmanı (#7): şemadaki `plan` alanı artık yalnız gösterilmiyor,
// gerçek limitlere bağlanıyor. Süresi dolan plan STARTER'a düşer — ödeme
// kesilince hizmet daralır ama tamamen durmaz (kilitlenmeyi önler).
//
// Not: fatura/tahsilat entegrasyonu (Stripe/iyzico) bu katmanın üstüne oturur;
// burada uygulama tarafındaki kota zorlaması var.

export type PlanName = 'STARTER' | 'GROWTH' | 'ENTERPRISE';

export type PlanLimits = {
  maxProducts: number; // kataloğa alınacak aktif ürün üst sınırı
  maxScansPerDay: number; // gün başına tam tarama sayısı
  periodicRescan: boolean; // periyodik (Faz B) fark taraması açık mı
};

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  STARTER: { maxProducts: 100, maxScansPerDay: 3, periodicRescan: false },
  GROWTH: { maxProducts: 2000, maxScansPerDay: 12, periodicRescan: true },
  ENTERPRISE: { maxProducts: 100000, maxScansPerDay: 96, periodicRescan: true },
};

export type PlanInput = { plan: string; planExpiresAt: Date | null };

// Plan süresi geçerli mi? (planExpiresAt yoksa süresiz sayılır)
export function isPlanActive(c: PlanInput): boolean {
  return !c.planExpiresAt || c.planExpiresAt.getTime() > Date.now();
}

// Uygulanacak plan: bilinmeyen ad ya da süresi dolmuş plan → STARTER.
export function effectivePlan(c: PlanInput): PlanName {
  if (!isPlanActive(c)) return 'STARTER';
  const name = (c.plan || 'STARTER').toUpperCase();
  return name === 'GROWTH' || name === 'ENTERPRISE' ? (name as PlanName) : 'STARTER';
}

export function planLimits(c: PlanInput): PlanLimits {
  return PLAN_LIMITS[effectivePlan(c)];
}
