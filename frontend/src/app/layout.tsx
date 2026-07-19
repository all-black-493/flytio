import type { Metadata } from "next";
import { League_Spartan, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider, ThemeScript } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "./globals.css";

const leagueSpartan = League_Spartan({
  variable: "--font-league-spartan",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "flyt.io — flight booking in full flow",
  description:
    "Search, book, and manage flights for yourself or your whole business. flyt is Norwegian for flow — and that's how booking should feel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased font-sans",
        leagueSpartan.variable,
        plexMono.variable,
      )}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeScript />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
