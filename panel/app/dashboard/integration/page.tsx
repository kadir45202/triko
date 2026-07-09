'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';

type Account = { token: string; companyName: string };

const PLATFORMS = [
  { name: 'Shopify', how: 'Online Store → Themes → Edit code → theme.liquid dosyasında </body> etiketinden hemen önce yapıştır.' },
  { name: 'WooCommerce', how: 'Görünüm → Tema Dosya Düzenleyicisi → footer.php içinde </body> öncesine yapıştır (veya bir "header/footer script" eklentisi kullan).' },
  { name: 'Ticimax', how: 'Yönetim paneli → Tasarım → Kod Düzenleme → Footer alanına yapıştır.' },
  { name: 'İkas', how: 'Ayarlar → Site Ayarları → Özel Kodlar → Footer koduna yapıştır.' },
  { name: 'Özel HTML', how: 'Tüm sayfalarda </body> kapanışından hemen önce yapıştır.' },
];

export default function IntegrationPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<Account>('/account').then(setAccount).catch(() => {});
  }, []);

  const snippet = account
    ? '<script src="https://cdn.triko.app/widget.js" data-token="' + account.token + '" async></script>'
    : 'Yükleniyor…';

  return (
    <>
      <PageHeader title="Kurulum" desc="Sitene tek satır kod ekle, maskot canlıya geçsin" />
      <Card title="Kurulum Kodu" className="mb-4">
        <div className="flex items-center gap-3">
          <code className="flex-1 block bg-slate-900 text-emerald-300 text-xs rounded-lg p-4 overflow-x-auto">{snippet}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 shrink-0"
          >
            {copied ? '✓ Kopyalandı' : 'Kopyala'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Not: CDN dağıtımı Faz 4&apos;te devreye girecek; şu an widget yerel olarak <code>/widget/widget.js</code> üzerinden servis ediliyor.
        </p>
      </Card>
      <Card title="Platform Kılavuzları">
        <ul className="divide-y divide-slate-100">
          {PLATFORMS.map((p) => (
            <li key={p.name} className="py-3">
              <div className="text-sm font-medium text-slate-800">{p.name}</div>
              <div className="text-sm text-slate-500 mt-0.5">{p.how}</div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
