import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Triko Panel',
  description: 'Triko maskot yönetim paneli',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
