'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader, StatTile } from '@/components/ui';
import { DeviceSplit, HBarList, HourlyHeatmap, LineChart } from '@/components/charts';

type Overview = {
  counts: Record<string, number>;
  rates: { previewRate: number; clickRate: number; cartRate: number };
  devices: { device: string; count: number }[];
};
type ComboRow = {
  id: string; name: string; isActive: boolean;
  shows: number; previews: number; clicks: number; carts: number; conversion: number;
};
type Series = { points: { date: string; count: number }[] };
type Hourly = { matrix: number[][] };
type Revenue = { attributedCarts: number; avgBasketValue: number; estimatedRevenue: number };

const PERIODS = [
  { key: '7d', label: '7 gün' },
  { key: '30d', label: '30 gün' },
  { key: '90d', label: '90 gün' },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [combos, setCombos] = useState<ComboRow[] | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [hourly, setHourly] = useState<Hourly | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    Promise.all([
      api<Overview>('/analytics/overview?period=' + period),
      api<ComboRow[]>('/analytics/combos?period=' + period),
      api<Series>('/analytics/timeseries?metric=combo_show&period=' + period),
      api<Hourly>('/analytics/hourly?period=' + period),
      api<Revenue>('/analytics/revenue?period=' + period),
    ])
      .then(([o, c, s, h, r]) => {
        setOverview(o);
        setCombos(c);
        setSeries(s);
        setHourly(h);
        setRevenue(r);
      })
      .catch((e) => setError(String(e.message || e)));
  }, [period]);

  async function exportCsv() {
    const res = await fetch('/api/analytics/export.csv?period=' + period, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('triko_at') || '') },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'triko-analytics-' + period + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="text-sm text-red-600">Veri alınamadı: {error}</p>;

  const top5 = (combos || []).slice().sort((a, b) => b.shows - a.shows).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Analitik"
        desc="Maskotun performansı"
        action={
          <div className="flex items-center gap-3">
            <button onClick={exportCsv}
              className="rounded-lg border border-slate-300 text-sm font-medium px-3 py-1.5 text-slate-600 hover:bg-slate-50">
              ⬇ CSV indir
            </button>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={'px-3 py-1.5 ' + (period === p.key ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                {p.label}
              </button>
            ))}
          </div>
          </div>
        }
      />
      {!overview || !combos || !series ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatTile label="Gösterim" value={(overview.counts['combo_show'] || 0).toLocaleString('tr-TR')} />
            <StatTile label="Önizleme Oranı" value={'%' + overview.rates.previewRate} />
            <StatTile label="Ürüne Geçiş Oranı" value={'%' + overview.rates.clickRate} />
            <StatTile label="Sepet Dönüşümü" value={'%' + overview.rates.cartRate} />
            {revenue && (
              <StatTile
                label="Tahmini Ek Gelir"
                value={'₺' + revenue.estimatedRevenue.toLocaleString('tr-TR')}
                sub={revenue.attributedCarts + ' sepet × ₺' + revenue.avgBasketValue.toLocaleString('tr-TR') + ' ort. sepet'}
              />
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <Card title="Günlük Gösterim">
              <LineChart points={series.points} />
            </Card>
            <div className="space-y-4">
              <Card title="En İyi 5 Kombin (gösterim)">
                <HBarList rows={top5.map((c) => ({ label: c.name, value: c.shows, sub: '%' + c.conversion + ' dönüşüm' }))} />
              </Card>
              <Card title="Cihaz Dağılımı">
                <DeviceSplit devices={overview.devices} />
              </Card>
            </div>
          </div>

          {hourly && (
            <Card title="Tıklamaların Saate Göre Dağılımı" className="mb-6">
              <HourlyHeatmap matrix={hourly.matrix} />
            </Card>
          )}

          <Card title="Kombin Bazlı Performans">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2 pr-3">Kombin</th>
                  <th className="pb-2 pr-3 text-right">Gösterim</th>
                  <th className="pb-2 pr-3 text-right">Önizleme</th>
                  <th className="pb-2 pr-3 text-right">Ürüne Geçiş</th>
                  <th className="pb-2 pr-3 text-right">Sepet</th>
                  <th className="pb-2 text-right">Dönüşüm</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-3 font-medium">
                      {c.name}
                      {!c.isActive && <span className="ml-2 text-xs text-slate-400">(pasif)</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right">{c.shows.toLocaleString('tr-TR')}</td>
                    <td className="py-2.5 pr-3 text-right">{c.previews.toLocaleString('tr-TR')}</td>
                    <td className="py-2.5 pr-3 text-right">{c.clicks.toLocaleString('tr-TR')}</td>
                    <td className="py-2.5 pr-3 text-right">{c.carts.toLocaleString('tr-TR')}</td>
                    <td className="py-2.5 text-right font-medium">%{c.conversion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
