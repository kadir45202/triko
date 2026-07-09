'use client';

// Bağımlılıksız SVG grafikler. Renkler doğrulanmış paletten:
// mor #7c3aed (birincil seri), petrol #0d9488 (ikincil kategori).
import { useMemo, useState } from 'react';

export const CHART = { primary: '#7c3aed', secondary: '#0d9488', grid: '#e2e8f0', ink: '#334155', muted: '#94a3b8' };

type Point = { date: string; count: number };

export function LineChart({ points, height = 200 }: { points: Point[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const P = { top: 12, right: 12, bottom: 24, left: 36 };

  const { path, area, xs, ys, max } = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.count));
    const iw = W - P.left - P.right;
    const ih = height - P.top - P.bottom;
    const xs = points.map((_, i) => P.left + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2));
    const ys = points.map((p) => P.top + ih - (p.count / max) * ih);
    const path = xs.map((x, i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + ys[i].toFixed(1)).join(' ');
    const area = path + ' L' + xs[xs.length - 1] + ',' + (P.top + ih) + ' L' + xs[0] + ',' + (P.top + ih) + ' Z';
    return { path, area, xs, ys, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, height]);

  if (!points.length) return <p className="text-sm text-slate-400">Veri yok.</p>;

  const gridYs = [0.25, 0.5, 0.75, 1].map((f) => P.top + (height - P.top - P.bottom) * (1 - f));

  return (
    <div className="relative">
      <svg
        viewBox={'0 0 ' + W + ' ' + height}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
          setHover(best);
        }}
      >
        {gridYs.map((y, i) => (
          <line key={i} x1={P.left} x2={W - P.right} y1={y} y2={y} stroke={CHART.grid} strokeWidth={1} />
        ))}
        {[0.25, 0.5, 0.75, 1].map((f, i) => (
          <text key={i} x={P.left - 6} y={gridYs[i] + 4} textAnchor="end" fontSize={10} fill={CHART.muted}>
            {Math.round(max * f)}
          </text>
        ))}
        <path d={area} fill={CHART.primary} opacity={0.08} />
        <path d={path} fill="none" stroke={CHART.primary} strokeWidth={2} strokeLinejoin="round" />
        {hover !== null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={P.top} y2={height - P.bottom} stroke={CHART.muted} strokeDasharray="3 3" strokeWidth={1} />
            <circle cx={xs[hover]} cy={ys[hover]} r={4} fill={CHART.primary} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        <text x={P.left} y={height - 6} fontSize={10} fill={CHART.muted}>{points[0].date}</text>
        <text x={W - P.right} y={height - 6} fontSize={10} fill={CHART.muted} textAnchor="end">
          {points[points.length - 1].date}
        </text>
      </svg>
      {hover !== null && (
        <div className="absolute top-0 right-0 bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 pointer-events-none">
          {points[hover].date} — <strong>{points[hover].count}</strong>
        </div>
      )}
    </div>
  );
}

export function HBarList({ rows, color = CHART.primary }: { rows: { label: string; value: number; sub?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="group">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-slate-700">{r.label}</span>
            <span className="text-slate-500">
              {r.value.toLocaleString('tr-TR')}{r.sub ? ' · ' + r.sub : ''}
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full group-hover:opacity-80"
              style={{ width: Math.max(2, (r.value / max) * 100) + '%', background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DeviceSplit({ devices }: { devices: { device: string; count: number }[] }) {
  const total = devices.reduce((s, d) => s + d.count, 0) || 1;
  const desktop = devices.find((d) => d.device === 'desktop')?.count || 0;
  const mobile = devices.find((d) => d.device === 'mobile')?.count || 0;
  const items = [
    { label: 'Masaüstü', count: desktop, color: CHART.primary },
    { label: 'Mobil', count: mobile, color: CHART.secondary },
  ];
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden" role="img" aria-label="Cihaz dağılımı">
        {items.map((it, i) => (
          <div
            key={it.label}
            style={{
              width: (it.count / total) * 100 + '%',
              background: it.color,
              marginLeft: i > 0 ? 2 : 0,
            }}
            title={it.label + ': ' + it.count}
          />
        ))}
      </div>
      <div className="flex gap-5 mt-3">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: it.color }} />
            {it.label} <strong>{Math.round((it.count / total) * 100)}%</strong> ({it.count.toLocaleString('tr-TR')})
          </div>
        ))}
      </div>
    </div>
  );
}
