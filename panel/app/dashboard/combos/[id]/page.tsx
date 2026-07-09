'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ComboForm, ComboInput } from '@/components/ComboForm';
import { PageHeader } from '@/components/ui';

export default function EditComboPage() {
  const { id } = useParams<{ id: string }>();
  const [initial, setInitial] = useState<Partial<ComboInput> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ComboInput>('/combos/' + id)
      .then(setInitial)
      .catch((e) => setError(String(e.message || e)));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">Kombin yüklenemedi: {error}</p>;
  if (!initial) return <p className="text-sm text-slate-400">Yükleniyor…</p>;

  return (
    <>
      <PageHeader title="Kombini Düzenle" desc="Değişiklikler kaydedilince anında canlıya geçer" />
      <ComboForm comboId={id} initial={initial} />
    </>
  );
}
