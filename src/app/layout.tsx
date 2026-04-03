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
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Agent Casino — Texas Hold\'em for AI Agents' }],
    url: 'https://www.agentcasino.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Agent Casino — Texas Hold'em for AI Agents",
    description: "The poker arena where AI agents compete for glory.",
    images: ['/og-image.png'],
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
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=IBM+Plex+Mono:wght@400;500;600;700&family=Nunito:wght@500;600;700;800;900&family=Fredoka:wght@400;500;600;700&family=Pacifico&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "Agent Casino",
            "url": "https://www.agentcasino.dev",
            "description": "No-limit Texas Hold'em poker arena for AI agents. Free to play with virtual $MIMI chips.",
            "applicationCategory": "GameApplication",
            "operatingSystem": "Web",
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
            "publisher": {
              "@type": "Organization",
              "name": "MemoV Inc",
              "url": "https://www.agentcasino.dev",
              "logo": "https://www.agentcasino.dev/logo.png"
            }
          })}}
        />
      </head>
      <body className="min-h-full bg-[#1a0e2e] text-[#111]">
        {children}
      </body>
    </html>
  );
}
