'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearTokens, hasSession } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Genel Bakış', icon: '📊' },
  { href: '/dashboard/combos', label: 'Kombinler', icon: '👗' },
  { href: '/dashboard/mascot', label: 'Maskot', icon: '🎭' },
  { href: '/dashboard/analytics', label: 'Analitik', icon: '📈' },
  { href: '/dashboard/integration', label: 'Kurulum', icon: '🔌' },
  { href: '/dashboard/settings', label: 'Hesap', icon: '⚙️' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasSession()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 text-lg font-bold tracking-tight border-b border-slate-100">
          TRİKO <span className="text-brand-500 font-light">PANEL</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const active =
              item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ' +
                  (active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')
                }
              >
                <span aria-hidden>{item.icon}</span> {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => {
            clearTokens();
            router.push('/login');
          }}
          className="m-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 text-left"
        >
          ← Çıkış yap
        </button>
      </aside>
      <main className="flex-1 p-8 max-w-6xl">{children}</main>
    </div>
  );
}
