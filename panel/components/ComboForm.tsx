'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui';

export type ComboInput = {
  triggerUrlPattern: string;
  triggerProductId: string | null;
  suggestedProductName: string;
  suggestedProductPrice: string;
  suggestedProductUrl: string;
  mascotText: string;
  socialProof: string | null;
  expertNote: string | null;
  priority: number;
  isActive: boolean;
};

const EMPTY: ComboInput = {
  triggerUrlPattern: '',
  triggerProductId: null,
  suggestedProductName: '',
  suggestedProductPrice: '',
  suggestedProductUrl: '',
  mascotText: '',
  socialProof: null,
  expertNote: null,
  priority: 0,
  isActive: true,
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400 mt-1 block">{hint}</span>}
    </label>
  );
}

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

export function ComboForm({ comboId, initial }: { comboId?: string; initial?: Partial<ComboInput> }) {
  const router = useRouter();
  const [form, setForm] = useState<ComboInput>({ ...EMPTY, ...initial });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ComboInput>(key: K, value: ComboInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (comboId) await api('/combos/' + comboId, { method: 'PUT', body: JSON.stringify(form) });
      else await api('/combos', { method: 'POST', body: JSON.stringify(form) });
      router.push('/dashboard/combos');
    } catch (err) {
      setError(String((err as Error).message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid lg:grid-cols-2 gap-4 items-start">
      <Card title="Tetikleyici" className="space-y-4">
        <Field label="Tetikleyici URL deseni" hint="Regex veya URL parçası — bu desenle eşleşen sayfalarda kombin gösterilir">
          <input required value={form.triggerUrlPattern} onChange={(e) => set('triggerUrlPattern', e.target.value)}
            placeholder={'urun\\.html\\?id=k-elbise-midi'} className={inputCls} />
        </Field>
        <Field label="Tetikleyici ürün ID (opsiyonel)">
          <input value={form.triggerProductId || ''} onChange={(e) => set('triggerProductId', e.target.value || null)} className={inputCls} />
        </Field>
        <Field label="Öncelik" hint="Aynı sayfada birden çok kombin varsa yüksek öncelik önce gösterilir">
          <input type="number" value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} className={inputCls} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          Kaydedilince aktif olsun
        </label>
      </Card>

      <Card title="Önerilen Ürün ve Mesaj" className="space-y-4">
        <Field label="Ürün adı">
          <input required value={form.suggestedProductName} onChange={(e) => set('suggestedProductName', e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fiyat">
            <input value={form.suggestedProductPrice} onChange={(e) => set('suggestedProductPrice', e.target.value)} placeholder="₺1.799" className={inputCls} />
          </Field>
          <Field label="Ürün URL">
            <input value={form.suggestedProductUrl} onChange={(e) => set('suggestedProductUrl', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label={'Maskot metni (' + form.mascotText.length + '/80)'} hint="Balonda çıkacak kısa mesaj">
          <input required maxLength={80} value={form.mascotText} onChange={(e) => set('mascotText', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Sosyal kanıt (opsiyonel)">
          <input value={form.socialProof || ''} onChange={(e) => set('socialProof', e.target.value || null)}
            placeholder="214 kişi bu kombini yaptı" className={inputCls} />
        </Field>
        <Field label="Uzman notu (opsiyonel)">
          <input value={form.expertNote || ''} onChange={(e) => set('expertNote', e.target.value || null)} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5 disabled:opacity-60">
            {saving ? 'Kaydediliyor…' : comboId ? 'Güncelle' : 'Oluştur'}
          </button>
          <button type="button" onClick={() => router.push('/dashboard/combos')}
            className="rounded-lg border border-slate-300 text-sm font-medium px-5 py-2.5 text-slate-600 hover:bg-slate-50">
            Vazgeç
          </button>
        </div>
      </Card>
    </form>
  );
}
