// Demo verisi: ATELIER mağazasıyla uyumlu bir müşteri, maskot ayarları,
// kombinler ve son 30 güne yayılmış gerçekçi analitik event'leri.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

const COMBOS = [
  {
    triggerUrlPattern: 'urun\\.html\\?id=k-elbise-midi',
    triggerProductId: 'k-elbise-midi',
    suggestedProductName: 'Desenli Saten Stiletto',
    suggestedProductPrice: '₺1.799',
    suggestedProductUrl: '/store/urun.html?id=k-topuklu',
    mascotText: 'Bu elbiseye bu stiletto çok yakışır! 👠',
    socialProof: '214 kişi bu kombini yaptı',
    priority: 10,
  },
  {
    triggerUrlPattern: 'urun\\.html\\?id=k-trenckot',
    triggerProductId: 'k-trenckot',
    suggestedProductName: 'Mini Omuz Çantası',
    suggestedProductPrice: '₺1.299',
    suggestedProductUrl: '/store/urun.html?id=k-canta',
    mascotText: 'Trençkotun yanına bu çanta birebir ✨',
    socialProof: '178 kişi bu kombini yaptı',
    priority: 8,
  },
  {
    triggerUrlPattern: 'urun\\.html\\?id=e-jean',
    triggerProductId: 'e-jean',
    suggestedProductName: 'Beyaz Deri Sneaker',
    suggestedProductPrice: '₺2.199',
    suggestedProductUrl: '/store/urun.html?id=e-sneaker',
    mascotText: 'Bu jean sneaker ile efsane durur 🔥',
    socialProof: '342 kişi bu kombini yaptı',
    priority: 9,
  },
  {
    triggerUrlPattern: 'urun\\.html\\?id=e-gomlek',
    triggerProductId: 'e-gomlek',
    suggestedProductName: 'Minimal Çelik Saat',
    suggestedProductPrice: '₺3.499',
    suggestedProductUrl: '/store/urun.html?id=e-saat',
    mascotText: 'Gömleğe şıklık katan dokunuş: bu saat ⌚',
    socialProof: '96 kişi bu kombini yaptı',
    priority: 5,
  },
];

const FUNNEL: Array<{ type: string; keepRate: number }> = [
  { type: 'combo_show', keepRate: 1 },
  { type: 'combo_preview', keepRate: 0.55 },
  { type: 'combo_click', keepRate: 0.4 },
  { type: 'add_to_cart', keepRate: 0.3 },
];

async function main() {
  const customer = await prisma.customer.upsert({
    where: { email: 'demo@triko.app' },
    update: {},
    create: {
      email: 'demo@triko.app',
      passwordHash: hashPassword('triko123'),
      companyName: 'ATELIER Moda',
      token: 'demo',
      plan: 'GROWTH',
      mascotSettings: { create: { mascotName: 'Triko', primaryColor: '#7c3aed' } },
    },
  });

  const existing = await prisma.combo.count({ where: { customerId: customer.id } });
  if (existing > 0) {
    console.log('Seed zaten uygulanmış, atlanıyor. (müşteri: demo@triko.app / triko123, token: demo)');
    return;
  }

  const combos = [];
  for (const c of COMBOS) {
    combos.push(await prisma.combo.create({ data: { customerId: customer.id, ...c } }));
  }

  // 30 güne yayılmış event'ler — her kombin için azalan huni
  const events: Array<{
    customerId: string; comboId: string; eventType: string;
    sessionId: string; pageUrl: string; deviceType: string; createdAt: Date;
  }> = [];
  for (const combo of combos) {
    const dailyShows = 4 + Math.floor(Math.random() * 8);
    for (let day = 0; day < 30; day++) {
      let carried = dailyShows;
      for (const step of FUNNEL) {
        carried = step.type === 'combo_show' ? carried : Math.round(carried * step.keepRate);
        for (let i = 0; i < carried; i++) {
          const at = new Date(Date.now() - day * 86400000 - Math.floor(Math.random() * 86400000));
          events.push({
            customerId: customer.id,
            comboId: combo.id,
            eventType: step.type,
            sessionId: 'seed-' + day + '-' + i,
            pageUrl: '/store/urun.html?id=' + combo.triggerProductId,
            deviceType: Math.random() < 0.42 ? 'mobile' : 'desktop',
            createdAt: at,
          });
        }
      }
    }
  }
  await prisma.analyticsEvent.createMany({ data: events });

  console.log('Seed tamam: müşteri demo@triko.app / triko123 (widget token: demo), ' +
    combos.length + ' kombin, ' + events.length + ' event.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
