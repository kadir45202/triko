'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader, StatTile } from '@/components/ui';
import { HBarList, LineChart } from '@/components/charts';

type Overview = {
  counts: Record<string, number>;
  funnel: { step: string; count: number }[];
  rates: { previewRate: number; clickRate: number; cartRate: number };
  devices: { device: string; count: number }[];
};
type Series = { points: { date: string; count: number }[] };

const STEP_LABELS: Record<string, string> = {
  combo_show: 'Kombin gösterimi',
  combo_preview: 'Önizleme',
  combo_click: 'Ürüne geçiş',
  add_to_cart: 'Sepete ekleme',
};

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<Overview>('/analytics/overview?period=30d'),
      api<Series>('/analytics/timeseries?metric=combo_show&period=30d'),
    ])
      .then(([o, s]) => {
        setData(o);
        setSeries(s);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  if (error) return <p className="text-sm text-red-600">Veri alınamadı: {error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Yükleniyor…</p>;

  return (
    <>
      <PageHeader title="Genel Bakış" desc="Son 30 günün özeti" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Kombin Gösterimi" value={(data.counts['combo_show'] || 0).toLocaleString('tr-TR')} sub="son 30 gün" />
        <StatTile label="Önizleme Oranı" value={'%' + data.rates.previewRate} sub="gösterim → önizleme" />
        <StatTile label="Ürüne Geçiş" value={'%' + data.rates.clickRate} sub="önizleme → ürün sayfası" />
        <StatTile label="Sepete Ekleme" value={(data.counts['add_to_cart'] || 0).toLocaleString('tr-TR')} sub="maskot kaynaklı" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Günlük Kombin Gösterimi (30 gün)">
          {series && <LineChart points={series.points} />}
        </Card>
        <Card title="Dönüşüm Hunisi">
          <HBarList rows={data.funnel.map((f) => ({ label: STEP_LABELS[f.step] || f.step, value: f.count }))} />
        </Card>
      </div>
    </>
  );
}
