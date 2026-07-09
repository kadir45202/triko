'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';

type Combo = {
  id: string;
  triggerUrlPattern: string;
  suggestedProductName: string;
  suggestedProductPrice: string;
  mascotText: string;
  socialProof: string | null;
  priority: number;
  isActive: boolean;
};

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [error, setError] = useState('');

  function load() {
    api<Combo[]>('/combos').then(setCombos).catch((e) => setError(String(e.message || e)));
  }
  useEffect(load, []);

  async function toggle(id: string) {
    await api('/combos/' + id + '/toggle', { method: 'PATCH' });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Bu kombin silinsin mi? Analitik kayıtları da silinir.')) return;
    await api('/combos/' + id, { method: 'DELETE' });
    load();
  }

  if (error) return <p className="text-sm text-red-600">Hata: {error}</p>;

  return (
    <>
      <PageHeader
        title="Kombinler"
        desc="Maskotun ürün sayfalarında önereceği kombinler"
        action={
          <Link href="/dashboard/combos/new" className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2">
            + Yeni Kombin
          </Link>
        }
      />
      <Card>
        {!combos ? (
          <p className="text-sm text-slate-400">Yükleniyor…</p>
        ) : combos.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz kombin yok. İlkini oluştur!</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-2 pr-3">Önerilen Ürün</th>
                <th className="pb-2 pr-3">Maskot Metni</th>
                <th className="pb-2 pr-3">Tetikleyici</th>
                <th className="pb-2 pr-3">Öncelik</th>
                <th className="pb-2 pr-3">Durum</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-3 pr-3 font-medium">
                    {c.suggestedProductName}
                    <div className="text-xs text-slate-400">{c.suggestedProductPrice}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-600 max-w-[220px]">{c.mascotText}</td>
                  <td className="py-3 pr-3">
                    <code className="text-xs bg-slate-100 rounded px-1.5 py-0.5">{c.triggerUrlPattern}</code>
                  </td>
                  <td className="py-3 pr-3">{c.priority}</td>
                  <td className="py-3 pr-3">
                    <button
                      onClick={() => toggle(c.id)}
                      className={
                        'text-xs font-medium rounded-full px-2.5 py-1 ' +
                        (c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')
                      }
                    >
                      {c.isActive ? '● Aktif' : '○ Pasif'}
                    </button>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Link href={'/dashboard/combos/' + c.id} className="text-brand-600 hover:underline text-xs font-medium mr-3">
                      Düzenle
                    </Link>
                    <button onClick={() => remove(c.id)} className="text-red-500 hover:underline text-xs font-medium">
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
