import { buildApp } from './app';
import { rescanAll } from './lib/agent';

const PORT = Number(process.env.PORT || 4000);
// Faz B aktif sinyal: siteUrl'i kayıtlı müşteriler periyodik yeniden taranır
// (yeni ürün → kataloğa + kombinlere; kaldırılan ürün → kombinleri kapat).
const RESCAN_MS = Number(process.env.AGENT_RESCAN_MS || 6 * 60 * 60 * 1000);

buildApp()
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => {
    console.log('Triko backend: http://localhost:' + PORT + '/api/health');
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
