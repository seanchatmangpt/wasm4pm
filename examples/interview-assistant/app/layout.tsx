import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'wasm4pm Cognition Interview Assistant',
  description: 'Deterministic interview cognition with Monaco code projection.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
