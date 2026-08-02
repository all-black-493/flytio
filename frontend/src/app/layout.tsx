import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import { CookieConsentBanner } from "@/components/analytics/cookie-consent-banner";
import { GoogleAnalyticsGate } from "@/components/analytics/google-analytics-gate";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query/providers";
import { cn } from "@/lib/utils";
import "./globals.css";

// Control Tower: Chakra Petch is the squared HUD display face; IBM Plex Mono
// carries all body/data text (the terminal voice).
const chakraPetch = Chakra_Petch({
  variable: "--font-chakra-petch",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "flyt — flight booking in full flow",
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
      suppressHydrationWarning
      className={cn("h-full antialiased font-sans", chakraPetch.variable, plexMono.variable) }
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="light">
          <QueryProvider>
            {/* Before {children}, deliberately: React runs sibling effects in
             * tree order, and sonner drops any toast published while it has no
             * subscribers (its publish() only notifies subscribers registered
             * at call time, and subscribe() never replays). Mounted after
             * {children}, its subscription happened *after* page-level mount
             * effects, so a toast fired on mount - e.g. the Google sign-in
             * error on /login?error=... - was silently swallowed. */}
            <Toaster />
            {children}
            <CookieConsentBanner />
            <GoogleAnalyticsGate />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
