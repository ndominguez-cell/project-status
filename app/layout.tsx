import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'Project Hub', template: '%s · Project Hub' },
  description: 'A secure command center for software, AI, automation, and experimental projects.',
  metadataBase: new URL(process.env.PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: {
    title: 'Project Hub',
    description: 'Every project. One clear next move.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Project Hub command center' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Project Hub',
    description: 'Every project. One clear next move.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
