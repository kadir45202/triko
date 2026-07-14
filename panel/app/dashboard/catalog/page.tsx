'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';

type Product = {
  id: string;
  externalId: string;
  url: string;
  name: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  category: string | null;
  color: string | null;
  styleTags: string[];
  season: string | null;
  enriched: boolean;
  source: string;
  status: string;
};

type Scan = {
  state: 'running' | 'done' | 'error';
  step: string;
  pagesScanned: number;
  productsFound: number;
  productsNew: number;
  combosCreated: number;
  pages?: string[];
  error?: string;
} | null;

type AgentEvent = { id: string; type: string; message: string; createdAt: string };

type ScanRun = {
  id: string;
  trigger: string;
  state: 'running' | 'done' | 'error';
  pagesScanned: number;
  productsFound: number;
  productsNew: number;
  productsRemoved: number;
  combosCreated: number;
  error: string | null;
  pages: string[];
  startedAt: string;
  finishedAt: string | null;
};

type Health = {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  activeProducts: number;
  nextScheduledAt: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  'ust-giyim': 'Üst Giyim', 'alt-giyim': 'Alt Giyim', 'elbise': 'Elbise',
  'dis-giyim': 'Dış Giyim', 'ayakkabi': 'Ayakkabı', 'canta': 'Çanta', 'aksesuar': 'Aksesuar',
};

const EVENT_ICONS: Record<string, string> = {
  scan_started: '🔍', platform_detected: '🔌', product_found: '🆕', product_enriched: '🏷️',
  combo_created: '✨', product_removed: '🗑️', scan_finished: '✅', error: '⚠️',
};

const TRIGGER_LABELS: Record<string, string> = { manual: 'Manuel', scheduled: 'Otomatik' };

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '…';
  const sec = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (sec < 60) return sec + ' sn';
  return Math.floor(sec / 60) + ' dk ' + (sec % 60) + ' sn';
}

// Taranan sayfa URL'lerinin kaydırılabilir listesi (canlı tarama + geçmiş)
function PageList({ pages }: { pages: string[] }) {
  return (
    <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 divide-y divide-slate-100">
      {pages.map((u, i) => (
        <li key={i} className="px-3 py-1.5 text-xs text-slate-600 truncate">
          <span className="text-slate-400 mr-2 tabular-nums">{i + 1}.</span>
          <a href={u} target="_blank" rel="noreferrer" className="hover:text-brand-600" title={u}>
            {u}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function CatalogPage() {
  const [siteUrl, setSiteUrl] = useState('');
  const [savedSiteUrl, setSavedSiteUrl] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [status, prods, activity, runData] = await Promise.all([
        api<{ siteUrl: string | null; scan: Scan }>('/catalog/status'),
        api<{ products: Product[] }>('/catalog/products'),
        api<{ events: AgentEvent[] }>('/agent/activity'),
        api<{ runs: ScanRun[]; health: Health }>('/catalog/runs'),
      ]);
      setSavedSiteUrl(status.siteUrl);
      setSiteUrl((cur) => cur || status.siteUrl || '');
      setScan(status.scan);
      setProducts(prods.products);
      setEvents(activity.events);
      setRuns(runData.runs);
      setHealth(runData.health);
      return status.scan;
    } catch (e) {
      setError(String((e as Error).message || e));
      return null;
    }
  }, []);

  // Tarama sürerken 2 sn'de bir tazele; bitince durdur
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const s = await load();
      if (!s || s.state !== 'running') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2000);
  }, [load]);

  useEffect(() => {
    load().then((s) => { if (s?.state === 'running') startPolling(); });
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load, startPolling]);

  async function startScan() {
    setError('');
    try {
      await api('/catalog/scan', { method: 'POST', body: JSON.stringify({ siteUrl }) });
      await load();
      startPolling();
    } catch (e) {
      setError(String((e as Error).message || e));
    }
  }

  const running = scan?.state === 'running';
  const active = (products || []).filter((p) => p.status === 'active');

  return (
    <>
      <PageHeader
        title="Katalog"
        desc="Triko ajanı sitenizi tarar, ürünleri öğrenir ve kombinleri otomatik kurar"
      />

      <Card>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex-1 min-w-[280px] text-sm">
            <span className="block text-xs font-medium text-slate-500 mb-1">Site adresi</span>
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://magazaniz.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>
          <button
            onClick={startScan}
            disabled={running || !/^https?:\/\//.test(siteUrl)}
            className="rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
          >
            {running ? 'Taranıyor…' : savedSiteUrl ? '↻ Yeniden tara' : '🤖 Siteyi tara'}
          </button>
        </div>
        {scan && (
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span
              className={
                'text-xs font-medium rounded-full px-2.5 py-1 ' +
                (scan.state === 'running'
                  ? 'bg-amber-50 text-amber-700'
                  : scan.state === 'done'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600')
              }
            >
              {scan.state === 'running' ? '● ' + scan.step : scan.state === 'done' ? '✓ Tamamlandı' : '✕ Hata: ' + (scan.error || '')}
            </span>
            <span className="text-slate-500 text-xs">
              {scan.pagesScanned} sayfa · {scan.productsFound} ürün görüldü · {scan.productsNew} yeni · {scan.combosCreated} kombin
            </span>
          </div>
        )}
        {scan && (scan.pages?.length ?? 0) > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer select-none text-xs font-medium text-slate-500 hover:text-slate-700">
              Taranan sayfalar ({scan.pages!.length})
            </summary>
            <PageList pages={scan.pages!} />
          </details>
        )}
        {error && <p className="mt-3 text-sm text-red-600">Hata: {error}</p>}
        <p className="mt-3 text-xs text-slate-400">
          Ajan önce mağaza altyapınızın açık ürün API&apos;sini dener (Shopify, WooCommerce) —
          varsa tüm katalog saniyeler içinde gelir. Yoksa sitenizi bir ziyaretçi gibi gezer:
          anasayfadan başlayıp kategori sayfalarındaki linkleri takip ederek ürün sayfalarını
          kendisi bulur. Ürün verisini JSON-LD, mikrodata veya OpenGraph etiketlerinden — hiçbiri
          yoksa sayfa başlığı ve fiyat bilgisinden — okur, kategorize eder ve uyumlu parçalardan
          kombinler kurar. Widget kurulu sayfalarda gezilen yeni ürünler ayrıca anında öğrenilir;
          kayıtlı site periyodik yeniden taranır.
        </p>
      </Card>

      {/* Kaynak sağlığı — editörün "bugün neden yeni kombin yok" sorusunun cevabı */}
      {health && (runs.length > 0 || savedSiteUrl) && (
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs font-medium text-slate-500">Son başarılı tarama</div>
            <div className="text-sm font-semibold mt-1">{fmtDateTime(health.lastSuccessAt)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs font-medium text-slate-500">Sonraki otomatik tarama</div>
            <div className="text-sm font-semibold mt-1">{fmtDateTime(health.nextScheduledAt)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs font-medium text-slate-500">Aktif ürün</div>
            <div className="text-sm font-semibold mt-1">{health.activeProducts}</div>
          </div>
          <div
            className={
              'rounded-2xl border p-4 ' +
              (health.consecutiveFailures > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200')
            }
          >
            <div className="text-xs font-medium text-slate-500">Kaynak durumu</div>
            <div className={'text-sm font-semibold mt-1 ' + (health.consecutiveFailures > 0 ? 'text-red-600' : 'text-emerald-600')}>
              {health.consecutiveFailures > 0
                ? '⚠ ' + health.consecutiveFailures + ' ardışık hata'
                : '✓ Sağlıklı'}
            </div>
            {health.consecutiveFailures > 0 && health.lastError && (
              <div className="text-xs text-red-500 mt-1 truncate" title={health.lastError}>{health.lastError}</div>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <h2 className="text-sm font-semibold mb-3">
              Keşfedilen ürünler{' '}
              <span className="font-normal text-slate-400">({active.length} aktif)</span>
            </h2>
            {!products ? (
              <p className="text-sm text-slate-400">Yükleniyor…</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-slate-500">
                Henüz ürün yok. Site adresinizi girip taramayı başlatın — gerisini ajan halleder.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="pb-2 pr-3">Ürün</th>
                      <th className="pb-2 pr-3">Kategori</th>
                      <th className="pb-2 pr-3">Renk</th>
                      <th className="pb-2 pr-3">Stil</th>
                      <th className="pb-2 pr-3">Fiyat</th>
                      <th className="pb-2">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 pr-3 font-medium max-w-[240px]">
                          <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-brand-600">
                            {p.name}
                          </a>
                          <div className="text-xs text-slate-400 font-normal">
                            {p.source === 'jsonld' ? 'widget sinyali' : 'site taraması'}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">
                          {p.category ? CATEGORY_LABELS[p.category] || p.category : '…'}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">{p.color || '—'}</td>
                        <td className="py-2.5 pr-3">
                          {p.styleTags.map((t) => (
                            <span key={t} className="inline-block text-[11px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 mr-1">
                              {t}
                            </span>
                          ))}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">
                          {p.price != null ? '₺' + p.price.toLocaleString('tr-TR') : '—'}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={
                              'text-xs font-medium rounded-full px-2 py-0.5 ' +
                              (p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400')
                            }
                          >
                            {p.status === 'active' ? 'aktif' : 'kaldırıldı'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="text-sm font-semibold mb-3">🤖 Ajan aktivitesi</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">Henüz aktivite yok.</p>
          ) : (
            <ul className="space-y-2.5">
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-2 text-xs leading-relaxed">
                  <span aria-hidden>{EVENT_ICONS[ev.type] || '•'}</span>
                  <div>
                    <div className="text-slate-700">{ev.message}</div>
                    <div className="text-slate-400">
                      {new Date(ev.createdAt).toLocaleString('tr-TR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {runs.length > 0 && (
        <div className="mt-6">
          <Card>
            <h2 className="text-sm font-semibold mb-3">Tarama geçmişi</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2 pr-3">Başlangıç</th>
                    <th className="pb-2 pr-3">Tetikleyici</th>
                    <th className="pb-2 pr-3">Süre</th>
                    <th className="pb-2 pr-3">Sayfa</th>
                    <th className="pb-2 pr-3">Ürün (yeni / kaldırılan)</th>
                    <th className="pb-2 pr-3">Kombin</th>
                    <th className="pb-2">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <Fragment key={r.id}>
                    <tr className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-3 whitespace-nowrap">{fmtDateTime(r.startedAt)}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{TRIGGER_LABELS[r.trigger] || r.trigger}</td>
                      <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">{fmtDuration(r.startedAt, r.finishedAt)}</td>
                      <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">
                        {(r.pages?.length ?? 0) > 0 ? (
                          <button
                            onClick={() => setOpenRunId(openRunId === r.id ? null : r.id)}
                            className="underline decoration-dotted underline-offset-2 hover:text-brand-600"
                            title="Taranan sayfaları göster/gizle"
                          >
                            {r.pagesScanned} {openRunId === r.id ? '▾' : '▸'}
                          </button>
                        ) : (
                          r.pagesScanned
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">
                        {r.productsFound}
                        <span className="text-xs text-slate-400"> ({r.productsNew} yeni{r.productsRemoved ? ' / ' + r.productsRemoved + ' kaldırıldı' : ''})</span>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{r.combosCreated}</td>
                      <td className="py-2.5">
                        <span
                          className={
                            'text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ' +
                            (r.state === 'done'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.state === 'running'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-600')
                          }
                          title={r.error || undefined}
                        >
                          {r.state === 'done' ? '✓ Başarılı' : r.state === 'running' ? '● Sürüyor' : '✕ ' + (r.error || 'Hata')}
                        </span>
                      </td>
                    </tr>
                    {openRunId === r.id && (r.pages?.length ?? 0) > 0 && (
                      <tr className="border-b border-slate-50 last:border-0">
                        <td colSpan={7} className="pb-3">
                          <PageList pages={r.pages} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
