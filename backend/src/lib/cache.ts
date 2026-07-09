// TTL'li basit anahtar-değer cache'i. Arayüz Redis'le birebir eşleşecek
// şekilde async tutuldu; REDIS_URL tanımlanınca bu modül ioredis tabanlı
// bir implementasyonla değiştirilebilir (get/set/del imzaları aynı kalır).

type Entry = { value: string; expiresAt: number };

const store = new Map<string, Entry>();

export async function cacheGet(key: string): Promise<string | null> {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return null;
  }
  return e.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function cacheDel(prefix: string): Promise<void> {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
