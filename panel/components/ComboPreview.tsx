'use client';

// Kombin önizleme modalı — editör yayınlamadan önce maskotun mağazada bu
// kombini nasıl sunacağını görür: konuşma balonu + elden sarkan ürün etiketi.
// Maskot ayarları (renk/görsel/isim) gerçek hesaptan gelir; temsili sahnedir.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type PreviewCombo = {
  id: string;
  suggestedProductName: string;
  suggestedProductPrice: string;
  suggestedProductUrl: string;
  suggestedProductImageOriginal?: string | null;
  suggestedProductImageProcessed?: string | null;
  mascotText: string;
  socialProof?: string | null;
  triggerUrlPattern: string;
};

type MascotSettings = {
  mascotName: string;
  primaryColor: string;
  imageUrl: string | null;
  sizeDesktop: number;
};

let settingsCache: MascotSettings | null = null;

export function ComboPreviewModal({
  combo,
  onClose,
  onPublish,
}: {
  combo: PreviewCombo;
  onClose: () => void;
  onPublish?: (id: string) => void | Promise<void>;
}) {
  const [s, setS] = useState<MascotSettings | null>(settingsCache);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settingsCache) return;
    api<MascotSettings>('/mascot/settings')
      .then((data) => {
        settingsCache = data;
        setS(data);
      })
      .catch(() => setS({ mascotName: 'Triko', primaryColor: '#7c3aed', imageUrl: null, sizeDesktop: 68 }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const image = combo.suggestedProductImageProcessed || combo.suggestedProductImageOriginal;
  const color = s?.primaryColor || '#7c3aed';
  const size = s?.sizeDesktop || 68;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Kombin önizlemesi"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Mağazada böyle görünecek</h3>
          <button onClick={onClose} aria-label="Kapat" className="text-slate-400 hover:text-slate-600 text-lg leading-none">
            ✕
          </button>
        </div>

        {/* Temsili mağaza sahnesi */}
        <div className="relative h-80 bg-slate-100 overflow-hidden">
          {/* arka plan: soluk ürün kartları */}
          <div className="absolute inset-4 grid grid-cols-3 gap-3 opacity-40" aria-hidden>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200" />
            ))}
          </div>

          {/* konuşma balonu */}
          <div className="absolute left-1/2 top-6 -translate-x-1/2 max-w-[85%] bg-white rounded-2xl shadow-md px-4 py-2.5 text-sm text-slate-700 text-center">
            {combo.mascotText}
            {combo.socialProof && (
              <div className="text-[11px] text-slate-400 mt-1">{combo.socialProof}</div>
            )}
          </div>

          {/* maskot */}
          {s?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.imageUrl}
              alt="Maskot"
              className="absolute left-[38%] bottom-16 -translate-x-1/2 object-contain drop-shadow-lg"
              style={{ width: size, height: size }}
            />
          ) : (
            <div
              className="absolute left-[38%] bottom-16 -translate-x-1/2 rounded-full flex items-center justify-center text-white text-2xl shadow-lg"
              style={{ width: size, height: size, background: 'linear-gradient(145deg, ' + color + ', #1e1b4b)' }}
              aria-hidden
            >
              🙂
            </div>
          )}

          {/* elden sarkan ürün etiketi */}
          <div className="absolute left-[58%] bottom-4 w-40">
            <div className="mx-auto h-6 w-px bg-slate-400" aria-hidden />
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-2 text-center">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={combo.suggestedProductName} className="h-20 w-full object-cover rounded-lg" />
              ) : (
                <div className="h-20 rounded-lg bg-slate-100 flex items-center justify-center text-2xl" aria-hidden>
                  👗
                </div>
              )}
              <div className="text-xs font-medium text-slate-700 mt-1.5 line-clamp-2">
                {combo.suggestedProductName}
              </div>
              {combo.suggestedProductPrice && (
                <div className="text-xs font-semibold mt-0.5" style={{ color }}>
                  {combo.suggestedProductPrice}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 text-xs text-slate-500 border-b border-slate-100">
          <div>
            <span className="font-medium text-slate-600">Tetikleyici sayfa:</span>{' '}
            <code className="bg-slate-100 rounded px-1 py-0.5 break-all">{combo.triggerUrlPattern}</code>
          </div>
          {combo.suggestedProductUrl && (
            <div className="mt-1">
              <span className="font-medium text-slate-600">Önerilen ürün:</span>{' '}
              <a href={combo.suggestedProductUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline break-all">
                {combo.suggestedProductUrl}
              </a>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Kapat
          </button>
          {onPublish && (
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  await onPublish(combo.id);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
            >
              {busy ? 'Yayınlanıyor…' : '✓ Yayınla'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
