'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';

type Account = {
  email: string;
  companyName: string;
  token: string;
  plan: string;
  planExpiresAt: string | null;
  createdAt: string;
};

export default function SettingsPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<Account>('/account').then((a) => {
      setAccount(a);
      setCompanyName(a.companyName);
    }).catch((e) => setMsg('Hata: ' + e.message));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/account', { method: 'PUT', body: JSON.stringify({ companyName }) });
      setMsg('✅ Kaydedildi.');
    } catch (err) {
      setMsg('Hata: ' + String((err as Error).message || err));
    }
  }

  if (!account) return <p className="text-sm text-slate-400">{msg || 'Yükleniyor…'}</p>;

  return (
    <>
      <PageHeader title="Hesap" desc="Firma bilgileri, API anahtarı ve plan" />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card title="Firma" className="space-y-4">
          <form onSubmit={save} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Firma adı</span>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <div className="text-sm text-slate-500">E-posta: <strong className="text-slate-700">{account.email}</strong></div>
            {msg && <p className="text-sm">{msg}</p>}
            <button type="submit" className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5">
              Kaydet
            </button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card title="Widget Token">
            <code className="block bg-slate-100 rounded-lg p-3 text-sm">{account.token}</code>
            <p className="text-xs text-slate-400 mt-2">Kurulum kodundaki data-token değeri budur. Gizli tutmana gerek yok, ama değiştirmek istersen destekle iletişime geç.</p>
          </Card>
          <Card title="Plan">
            <div className="text-2xl font-bold">{account.plan}</div>
            <p className="text-xs text-slate-400 mt-1">
              {account.planExpiresAt ? 'Bitiş: ' + new Date(account.planExpiresAt).toLocaleDateString('tr-TR') : 'Süresiz demo planı'}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
