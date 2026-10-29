import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://b2b.ugurpromilling.com'),
  title: {
    default: 'Tedarik Portalı // Uğur Promilling - Tedarik Portalı',
    template: '%s // Uğur Promilling - Tedarik Portalı',
  },
  description: 'Uğur Promilling tedarik portalı',
  applicationName: 'Uğur Promilling Tedarik Portalı',
  icons: {
    icon: [
      { url: '/favicon/favicon.ico', sizes: 'any' },
      { url: '/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/favicon/site.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
