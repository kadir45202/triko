'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';

type Settings = {
  mascotName: string;
  primaryColor: string;
  sizeDesktop: number;
  sizeMobile: number;
  proactiveDelayMs: number;
  proactiveIntervalMs: number;
  maxDailyShows: number;
  mobileEnabled: boolean;
  noGoSelectors: string[];
};

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

export default function MascotPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Settings>('/mascot/settings').then(setS).catch((e) => setMsg('Hata: ' + e.message));
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setSaving(true);
    setMsg('');
    try {
      await api('/mascot/settings', { method: 'PUT', body: JSON.stringify(s) });
      setMsg('✅ Kaydedildi — widget bir sonraki yüklemede yeni ayarları alır.');
    } catch (err) {
      setMsg('Hata: ' + String((err as Error).message || err));
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <p className="text-sm text-slate-400">{msg || 'Yükleniyor…'}</p>;

  return (
    <>
      <PageHeader title="Maskot Ayarları" desc="Görünüm ve davranış — sağda canlı önizleme" />
      <form onSubmit={save} className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <Card title="Görünüm" className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Maskot adı</span>
              <input value={s.mascotName} maxLength={24} onChange={(e) => set('mascotName', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Ana renk</span>
              <div className="flex items-center gap-3 mt-1">
                <input type="color" value={s.primaryColor} onChange={(e) => set('primaryColor', e.target.value)}
                  className="h-9 w-14 rounded cursor-pointer border border-slate-300" />
                <code className="text-sm text-slate-500">{s.primaryColor}</code>
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Boyut — masaüstü (px)</span>
                <input type="number" min={40} max={120} value={s.sizeDesktop} onChange={(e) => set('sizeDesktop', Number(e.target.value))} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Boyut — mobil (px)</span>
                <input type="number" min={32} max={96} value={s.sizeMobile} onChange={(e) => set('sizeMobile', Number(e.target.value))} className={inputCls} />
              </label>
            </div>
          </Card>
          <Card title="Davranış" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">İlk öneri gecikmesi (sn)</span>
                <input type="number" min={1} value={s.proactiveDelayMs / 1000}
                  onChange={(e) => set('proactiveDelayMs', Number(e.target.value) * 1000)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Öneri sıklığı (sn)</span>
                <input type="number" min={10} value={s.proactiveIntervalMs / 1000}
                  onChange={(e) => set('proactiveIntervalMs', Number(e.target.value) * 1000)} className={inputCls} />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Günlük maksimum gösterim</span>
              <input type="number" min={1} value={s.maxDailyShows} onChange={(e) => set('maxDailyShows', Number(e.target.value))} className={inputCls} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={s.mobileEnabled} onChange={(e) => set('mobileEnabled', e.target.checked)} />
              Mobilde aktif
            </label>
          </Card>
          {msg && <p className="text-sm">{msg}</p>}
          <button type="submit" disabled={saving}
            className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5 disabled:opacity-60">
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>

        <Card title="Canlı Önizleme">
          <div className="relative h-72 rounded-xl bg-slate-100 overflow-hidden">
            <div className="absolute left-1/2 top-10 -translate-x-1/2 bg-white rounded-2xl shadow px-4 py-2 text-sm text-slate-700">
              Merhaba, ben <strong>{s.mascotName || 'Triko'}</strong>! 👋
            </div>
            <div
              className="absolute left-1/2 bottom-10 -translate-x-1/2 rounded-full flex items-center justify-center text-white text-2xl shadow-lg animate-bounce"
              style={{
                width: s.sizeDesktop,
                height: s.sizeDesktop,
                background: 'linear-gradient(145deg, ' + s.primaryColor + ', #1e1b4b)',
              }}
              aria-label="Maskot önizlemesi"
            >
              🙂
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Önizleme temsili — gerçek maskot, mağazadaki animasyonlu karakterdir.
          </p>
        </Card>
      </form>
    </>
  );
}
