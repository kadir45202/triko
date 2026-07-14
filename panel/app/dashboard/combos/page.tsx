'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';
import { ComboPreviewModal, PreviewCombo } from '@/components/ComboPreview';

type Combo = PreviewCombo & {
  priority: number;
  isActive: boolean;
  status: string;
  source: string;
};

type Filter = 'all' | 'active' | 'passive' | 'pending';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Tümü' },
  { key: 'active', label: 'Aktif' },
  { key: 'passive', label: 'Pasif' },
  { key: 'pending', label: 'Onay bekliyor' },
];

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Combo | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<Combo[]>('/combos')
      .then((rows) => {
        setCombos(rows);
        setSelected((cur) => new Set(Array.from(cur).filter((id) => rows.some((c) => c.id === id))));
      })
      .catch((e) => setError(String(e.message || e)));
  }
  useEffect(load, []);

  const visible = useMemo(() => {
    if (!combos) return null;
    const q = query.trim().toLowerCase();
    return combos.filter((c) => {
      if (filter === 'active' && !(c.isActive && c.status === 'published')) return false;
      if (filter === 'passive' && (c.isActive || c.status === 'pending')) return false;
      if (filter === 'pending' && c.status !== 'pending') return false;
      if (!q) return true;
      return (
        c.suggestedProductName.toLowerCase().includes(q) ||
        c.mascotText.toLowerCase().includes(q) ||
        c.triggerUrlPattern.toLowerCase().includes(q)
      );
    });
  }, [combos, query, filter]);

  const allSelected = !!visible?.length && visible.every((c) => selected.has(c.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set((visible || []).map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggle(id: string) {
    await api('/combos/' + id + '/toggle', { method: 'PATCH' });
    load();
  }

  async function bulk(action: 'activate' | 'deactivate' | 'delete' | 'publish', ids: string[]) {
    if (!ids.length) return;
    if (action === 'delete' && !confirm(ids.length + ' kombin silinsin mi? Analitik kayıtları da silinir.')) return;
    setBusy(true);
    try {
      await api('/combos/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) });
      setPreview(null);
      load();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu kombin silinsin mi? Analitik kayıtları da silinir.')) return;
    await api('/combos/' + id, { method: 'DELETE' });
    load();
  }

  if (error) return <p className="text-sm text-red-600">Hata: {error}</p>;

  const sel = Array.from(selected);

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
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 Ürün, metin veya URL ara…"
            className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            aria-label="Kombin ara"
          />
          <div className="flex gap-1" role="tablist" aria-label="Durum filtresi">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  'text-xs font-medium rounded-full px-3 py-1.5 ' +
                  (filter === f.key ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {sel.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => bulk('activate', sel)} disabled={busy}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5">
                Aktifleştir ({sel.length})
              </button>
              <button onClick={() => bulk('deactivate', sel)} disabled={busy}
                className="rounded-lg bg-slate-600 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5">
                Pasifleştir
              </button>
              <button onClick={() => bulk('delete', sel)} disabled={busy}
                className="rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 text-xs font-medium px-3 py-1.5">
                Sil
              </button>
            </div>
          )}
        </div>

        {!visible ? (
          <p className="text-sm text-slate-400">Yükleniyor…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">
            {combos?.length ? 'Filtreye uyan kombin yok.' : 'Henüz kombin yok. İlkini oluştur!'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2 pr-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Tümünü seç" />
                  </th>
                  <th className="pb-2 pr-3">Önerilen Ürün</th>
                  <th className="pb-2 pr-3">Maskot Metni</th>
                  <th className="pb-2 pr-3">Tetikleyici</th>
                  <th className="pb-2 pr-3">Kaynak</th>
                  <th className="pb-2 pr-3">Durum</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        aria-label={c.suggestedProductName + ' seç'}
                      />
                    </td>
                    <td className="py-3 pr-3 font-medium">
                      {c.suggestedProductName}
                      <div className="text-xs text-slate-400">{c.suggestedProductPrice}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-600 max-w-[220px]">{c.mascotText}</td>
                    <td className="py-3 pr-3">
                      <code className="text-xs bg-slate-100 rounded px-1.5 py-0.5">{c.triggerUrlPattern}</code>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="text-xs text-slate-500">
                        {c.source === 'agent' ? '🤖 Ajan' : '✍️ Manuel'}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {c.status === 'pending' ? (
                        <Link href="/dashboard/queue"
                          className="text-xs font-medium rounded-full px-2.5 py-1 bg-amber-50 text-amber-700 whitespace-nowrap">
                          ⏳ Onay bekliyor
                        </Link>
                      ) : (
                        <button
                          onClick={() => toggle(c.id)}
                          className={
                            'text-xs font-medium rounded-full px-2.5 py-1 ' +
                            (c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')
                          }
                        >
                          {c.isActive ? '● Aktif' : '○ Pasif'}
                        </button>
                      )}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button onClick={() => setPreview(c)} className="text-brand-600 hover:underline text-xs font-medium mr-3">
                        👁 Önizle
                      </button>
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
          </div>
        )}
      </Card>

      {preview && (
        <ComboPreviewModal
          combo={preview}
          onClose={() => setPreview(null)}
          onPublish={preview.status === 'pending' ? (id) => bulk('publish', [id]) : undefined}
        />
      )}
    </>
  );
}
