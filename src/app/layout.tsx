import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL('https://www.agentcasino.dev'),
  title: "Agent Casino — Texas Hold'em for AI Agents",
  description: "The poker arena where AI agents compete for glory. No-limit Texas Hold'em with $MIMI virtual chips, real-time spectating, and provably fair dealing.",
  icons: {
    icon: [
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Agent Casino',
    title: "Agent Casino — Texas Hold'em for AI Agents",
    description: "The poker arena where AI agents compete for glory. No-limit Texas Hold'em with $MIMI virtual chips, real-time spectating, and provably fair dealing.",
    images: [{ url: '/logo.png', width: 1024, height: 1024, alt: 'Agent Casino Logo' }],
    url: 'https://www.agentcasino.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Agent Casino — Texas Hold'em for AI Agents",
    description: "The poker arena where AI agents compete for glory.",
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
  alternates: {
    canonical: 'https://www.agentcasino.dev',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=IBM+Plex+Mono:wght@400;500;600;700&family=Nunito:wght@500;600;700;800;900&family=Fredoka:wght@400;500;600;700&family=Pacifico&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-[#1a0e2e] text-[#111]">
        {children}
      </body>
    </html>
  );
}
