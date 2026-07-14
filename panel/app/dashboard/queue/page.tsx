'use client';

// Onay Kuyruğu — ajanın kurduğu, yayın onayı bekleyen kombinler.
// Editör tek tek önizleyip yayınlar ya da çoklu seçimle toplu işlem yapar.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';
import { ComboPreviewModal, PreviewCombo } from '@/components/ComboPreview';

type Combo = PreviewCombo & {
  priority: number;
  isActive: boolean;
  status: string;
  source: string;
  createdAt: string;
};

export default function QueuePage() {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Combo | null>(null);
  const [autoPublish, setAutoPublish] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [pending, status] = await Promise.all([
        api<Combo[]>('/combos?status=pending'),
        api<{ autoPublishCombos: boolean }>('/catalog/status'),
      ]);
      setCombos(pending);
      setAutoPublish(status.autoPublishCombos);
      setSelected((cur) => new Set(Array.from(cur).filter((id) => pending.some((c) => c.id === id))));
    } catch (e) {
      setError(String((e as Error).message || e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allSelected = useMemo(
    () => !!combos?.length && combos.every((c) => selected.has(c.id)),
    [combos, selected],
  );

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set((combos || []).map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: 'publish' | 'delete', ids: string[]) {
    if (!ids.length) return;
    if (action === 'delete' && !confirm(ids.length + ' kombin silinsin mi? Bu işlem geri alınamaz.')) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ affected: number }>('/combos/bulk', {
        method: 'POST',
        body: JSON.stringify({ action, ids }),
      });
      setNotice(
        action === 'publish'
          ? r.affected + ' kombin yayınlandı ✓'
          : r.affected + ' kombin silindi',
      );
      setPreview(null);
      await load();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAutoPublish(value: boolean) {
    setAutoPublish(value); // iyimser güncelle
    try {
      await api('/catalog/settings', {
        method: 'PUT',
        body: JSON.stringify({ autoPublishCombos: value }),
      });
    } catch (e) {
      setAutoPublish(!value);
      setError(String((e as Error).message || e));
    }
  }

  const sel = Array.from(selected);

  return (
    <>
      <PageHeader
        title="Onay Kuyruğu"
        desc="Ajanın kurduğu kombinler — önizle, yayınla ya da sil"
      />

      {autoPublish !== null && (
        <Card className="mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium text-slate-700">Yeni ajan kombinleri</div>
              <p className="text-xs text-slate-500 mt-0.5">
                {autoPublish
                  ? 'Otomatik yayınlanıyor — kapatırsan yeni kombinler önce bu kuyruğa düşer.'
                  : 'Önce onayına sunuluyor — sen yayınlamadan widget’a çıkmazlar.'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={!autoPublish}
                onChange={(e) => saveAutoPublish(!e.target.checked)}
              />
              Yayınlamadan önce onayımı iste
            </label>
          </div>
        </Card>
      )}

      {(notice || error) && (
        <p className={'mb-4 text-sm ' + (error ? 'text-red-600' : 'text-emerald-700')}>
          {error ? 'Hata: ' + error : notice}
        </p>
      )}

      <Card>
        {!combos ? (
          <p className="text-sm text-slate-400">Yükleniyor…</p>
        ) : combos.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">
            <div className="text-3xl mb-2" aria-hidden>✅</div>
            Onay bekleyen kombin yok.
            {autoPublish && (
              <p className="text-xs text-slate-400 mt-1">
                Ajan kombinleri şu an otomatik yayınlanıyor — kuyruğu kullanmak için yukarıdaki ayarı aç.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                Tümünü seç ({combos.length})
              </label>
              <div className="flex-1" />
              <button
                onClick={() => bulk('publish', sel)}
                disabled={busy || !sel.length}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5"
              >
                ✓ Seçilenleri yayınla{sel.length ? ' (' + sel.length + ')' : ''}
              </button>
              <button
                onClick={() => bulk('delete', sel)}
                disabled={busy || !sel.length}
                className="rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 text-xs font-medium px-3 py-1.5"
              >
                Seçilenleri sil
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2 pr-2 w-8" aria-label="Seç" />
                    <th className="pb-2 pr-3">Önerilen Ürün</th>
                    <th className="pb-2 pr-3">Maskot Metni</th>
                    <th className="pb-2 pr-3">Eklendi</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {combos.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-3 pr-2">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          aria-label={c.suggestedProductName + ' seç'}
                        />
                      </td>
                      <td className="py-3 pr-3 font-medium max-w-[220px]">
                        <div className="flex items-center gap-2.5">
                          {(c.suggestedProductImageProcessed || c.suggestedProductImageOriginal) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.suggestedProductImageProcessed || c.suggestedProductImageOriginal || ''}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover shrink-0 bg-slate-100"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" aria-hidden />
                          )}
                          <div>
                            {c.suggestedProductName}
                            <div className="text-xs text-slate-400 font-normal">{c.suggestedProductPrice}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-slate-600 max-w-[260px]">{c.mascotText}</td>
                      <td className="py-3 pr-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleString('tr-TR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setPreview(c)}
                          className="text-brand-600 hover:underline text-xs font-medium mr-3"
                        >
                          👁 Önizle
                        </button>
                        <button
                          onClick={() => bulk('publish', [c.id])}
                          disabled={busy}
                          className="text-emerald-600 hover:underline text-xs font-medium mr-3"
                        >
                          Yayınla
                        </button>
                        <Link
                          href={'/dashboard/combos/' + c.id}
                          className="text-slate-500 hover:underline text-xs font-medium mr-3"
                        >
                          Düzenle
                        </Link>
                        <button
                          onClick={() => bulk('delete', [c.id])}
                          disabled={busy}
                          className="text-red-500 hover:underline text-xs font-medium"
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {preview && (
        <ComboPreviewModal
          combo={preview}
          onClose={() => setPreview(null)}
          onPublish={(id) => bulk('publish', [id])}
        />
      )}
    </>
  );
}
