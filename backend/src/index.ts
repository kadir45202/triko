import { buildApp } from './app';
import { recoverStuckScans, rescanAll } from './lib/agent';

const PORT = Number(process.env.PORT || 4000);
// Faz B aktif sinyal: siteUrl'i kayıtlı müşteriler periyodik yeniden taranır
// (yeni ürün → kataloğa + kombinlere; kaldırılan ürün → kombinleri kapat).
const RESCAN_MS = Number(process.env.AGENT_RESCAN_MS || 6 * 60 * 60 * 1000);

buildApp()
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(async () => {
    console.log('Triko backend: http://localhost:' + PORT + '/api/health');
    // Açılışta: önceki süreçten "running" kalmış (asla bitmeyecek) taramaları toparla
    const recovered = await recoverStuckScans().catch(() => 0);
    if (recovered) console.log('Yarım kalmış ' + recovered + ' tarama toparlandı (interrupted_restart)');
    if (RESCAN_MS > 0) {
      setInterval(() => {
        rescanAll().catch((err) => console.error('rescan failed:', err));
      }, RESCAN_MS).unref();
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
