// Kayan pencereli basit rate limiter (token başına). Üretimde çok
// instance'lı kurulumda Redis tabanlı sayaçla değiştirilmeli.

const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimitOk(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now > w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}
