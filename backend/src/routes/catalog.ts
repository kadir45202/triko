// Katalog ajanı uçları (Faz A/B): panelden tarama yönetimi + widget'ın
// pasif JSON-LD sinyali. Tarama arka planda çalışır, durum bellekten okunur.
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { rateLimitOk } from '../lib/rateLimit';
import { originAllowed } from '../lib/domains';
import {
  getScanStatus,
  handleNewProduct,
  isScanRunning,
  runScan,
  upsertProduct,
} from '../lib/agent';
import { externalIdFromUrl } from '../lib/crawler';

export async function catalogRoutes(app: FastifyInstance) {
  // Tam site taraması başlat (Faz A). siteUrl müşteriye kaydedilir ki
  // periyodik fark taraması (Faz B) da aynı adresi kullansın.
  app.post('/api/catalog/scan', { preHandler: app.authGuard }, async (req, reply) => {
    const { siteUrl } = (req.body || {}) as { siteUrl?: string };
    if (!siteUrl || !/^https?:\/\//i.test(siteUrl)) {
      return reply.code(400).send({ error: 'valid_siteUrl_required' });
    }
    if (isScanRunning(req.customerId)) return reply.code(409).send({ error: 'scan_already_running' });

    await prisma.customer.update({ where: { id: req.customerId }, data: { siteUrl } });
    void runScan(req.customerId, siteUrl); // arka planda; durum /status'tan izlenir
    return { started: true };
  });

  app.get('/api/catalog/status', { preHandler: app.authGuard }, async (req) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.customerId },
      select: { siteUrl: true, autoPublishCombos: true },
    });
    return {
      siteUrl: customer?.siteUrl ?? null,
      autoPublishCombos: customer?.autoPublishCombos ?? true,
      scan: getScanStatus(req.customerId),
    };
  });

  // Ajan ayarı: yeni kombinler otomatik mi yayınlansın, onay kuyruğuna mı düşsün
  app.put('/api/catalog/settings', { preHandler: app.authGuard }, async (req, reply) => {
    const { autoPublishCombos } = (req.body || {}) as { autoPublishCombos?: unknown };
    if (typeof autoPublishCombos !== 'boolean') {
      return reply.code(400).send({ error: 'autoPublishCombos_boolean_required' });
    }
    await prisma.customer.update({
      where: { id: req.customerId },
      data: { autoPublishCombos },
    });
    return { ok: true, autoPublishCombos };
  });

  // Tarama geçmişi + kaynak sağlığı (Katalog panosu)
  app.get('/api/catalog/runs', { preHandler: app.authGuard }, async (req) => {
    const runs = await prisma.scanRun.findMany({
      where: { customerId: req.customerId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    const lastSuccess = runs.find((r) => r.state === 'done');
    let consecutiveFailures = 0;
    for (const r of runs) {
      if (r.state === 'error') consecutiveFailures++;
      else break;
    }
    const rescanMs = Number(process.env.AGENT_RESCAN_MS || 6 * 60 * 60 * 1000);
    const lastFinished = runs.find((r) => r.state !== 'running');
    const activeProducts = await prisma.product.count({
      where: { customerId: req.customerId, status: 'active' },
    });

    return {
      // pages JSON string olarak saklanır; panel için diziye açılır
      runs: runs.map((r) => {
        let pages: string[] = [];
        try { pages = JSON.parse(r.pages || '[]'); } catch { /* bozuk kayıt boş liste sayılır */ }
        return { ...r, pages };
      }),
      health: {
        lastSuccessAt: lastSuccess?.finishedAt ?? null,
        lastErrorAt: runs.find((r) => r.state === 'error')?.finishedAt ?? null,
        lastError: runs.find((r) => r.state === 'error')?.error ?? null,
        consecutiveFailures,
        activeProducts,
        // periyodik fark taraması kapalıysa null
        nextScheduledAt:
          rescanMs > 0 && lastFinished?.finishedAt
            ? new Date(lastFinished.finishedAt.getTime() + rescanMs).toISOString()
            : null,
      },
    };
  });

  app.get('/api/catalog/products', { preHandler: app.authGuard }, async (req) => {
    const products = await prisma.product.findMany({
      where: { customerId: req.customerId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return {
      products: products.map((p) => ({ ...p, styleTags: JSON.parse(p.styleTags || '[]') })),
    };
  });

  app.get('/api/agent/activity', { preHandler: app.authGuard }, async (req) => {
    const events = await prisma.agentEvent.findMany({
      where: { customerId: req.customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { events };
  });

  // Faz B pasif sinyal: widget, ziyaret edilen sayfadaki schema.org/Product
  // JSON-LD verisini bildirir. Bilinmeyen ürün → zenginleştir + kombinlere kat.
  app.post('/api/widget/ingest', async (req, reply) => {
    const body = (req.body || {}) as {
      token?: string;
      product?: {
        id?: string; url?: string; name?: string;
        price?: number; currency?: string; image?: string; category?: string;
      };
    };
    const { token, product } = body;
    if (!token || !product || !product.name || !product.url) {
      return reply.code(400).send({ error: 'token_and_product_required' });
    }
    if (!rateLimitOk('ing:' + token, 60, 60_000)) return reply.code(429).send({ error: 'rate_limited' });

    const customer = await prisma.customer.findUnique({
      where: { token },
      select: { id: true, allowedDomains: true },
    });
    if (!customer) return reply.code(404).send({ error: 'not_found' });
    if (!originAllowed(req, customer.allowedDomains)) return reply.code(403).send({ error: 'domain_not_allowed' });

    const { isNew } = await upsertProduct(
      customer.id,
      {
        externalId: String(product.id || externalIdFromUrl(product.url)).slice(0, 120),
        url: String(product.url).slice(0, 500),
        name: String(product.name).slice(0, 200),
        price: typeof product.price === 'number' && isFinite(product.price) ? product.price : null,
        currency: product.currency ? String(product.currency).slice(0, 8) : 'TRY',
        imageUrl: product.image ? String(product.image).slice(0, 500) : null,
        rawCategory: product.category ? String(product.category).slice(0, 100) : null,
      },
      'jsonld',
    );
    // Yeni ürünse ajan arka planda öğrenir: kategorize eder, kombinlere dahil eder
    if (isNew) void handleNewProduct(customer.id).catch(() => {});
    return { ok: true, known: !isNew };
  });
}
