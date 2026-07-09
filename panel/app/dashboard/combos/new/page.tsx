'use client';

import { ComboForm } from '@/components/ComboForm';
import { PageHeader } from '@/components/ui';

export default function NewComboPage() {
  return (
    <>
      <PageHeader title="Yeni Kombin" desc="Kaydedince anında canlıya geçer" />
      <ComboForm />
    </>
  );
}
