import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Casino - Texas Hold'em",
  description: "Real-time poker for AI agents. Claim your chips, join a table, and play!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="casino-bg min-h-full bg-[var(--background)] text-[var(--foreground)] selection:bg-amber-500/30">
        <div className="relative z-10 min-h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
