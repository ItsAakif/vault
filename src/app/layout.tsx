import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { PageErrorBoundary } from '@/components/error/error-boundary';
import { errorRecoveryService } from '@/lib/error-recovery';
import { logger } from '@/lib/logger';

// T083: the supplied theme's type stacks (tweakcn "Vescrow 1.2").
//
// Fonts were previously pinned to system stacks "to avoid tsx compatibility
// issues"; the user has now chosen a theme whose identity is Bricolage Grotesque
// + JetBrains Mono, so both are fetched and self-hosted by `next/font`.
//
// HONEST LIMIT: `next/font/google` downloads at BUILD time. A cold build with no
// egress to fonts.googleapis.com fails, and there is no font-loader cache in
// `.next/cache` today. If that ever bites, delete these two calls: `--font-sans`
// and `--font-mono` in globals.css already carry a documented system fallback
// inside their `var(..., fallback)`, so the app stays readable either way.
//
// Georgia is deliberately NOT here: it is not a Google font (importing it does
// not compile), so it is a plain system stack (`--font-serif`) in globals.css.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Vault: Your Personal Command Center",
  description: "A comprehensive PWA that serves as your personal command center for managing thoughts, projects, career opportunities, and schedules in one unified, intelligent system.",
  keywords: ["vault", "command center", "productivity", "PWA", "organization", "projects", "calendar", "career", "notes"],
  authors: [{ name: "Vault Command Center" }],
  // manifest: "/manifest.json", // Disabled to prevent SW registration
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vault: Your Personal Command Center",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Vault: Your Personal Command Center",
    description: "Your unified command center for thoughts, projects, career, and schedule management",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vault: Your Personal Command Center",
    description: "Your unified command center for thoughts, projects, career, and schedule management",
  },
  icons: {
    // The SVG tile is declared FIRST so it is the primary tab icon; the PNGs
    // stay as fallbacks for browsers that do not accept SVG favicons.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "application-name": "Vault: Your Personal Command Center",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "Vault: Your Personal Command Center",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${bricolage.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="theme-color" content="#3b82f6" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </head>
      <body
        className="antialiased bg-background text-foreground"
      >
        <PageErrorBoundary>
          <Providers>
            {children}
            <Toaster />
            <SonnerToaster />
          </Providers>
        </PageErrorBoundary>
        {/* Force unregister all service workers and clear cache */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Immediately unregister all service workers
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for(let registration of registrations) {
                    registration.unregister().then(function() {
                      console.log('SW unregistered: ', registration);
                      // Force reload after unregistering
                      if (registrations.length > 0) {
                        window.location.reload();
                      }
                    });
                  }
                });
                
                // Clear all caches
                if ('caches' in window) {
                  caches.keys().then(function(cacheNames) {
                    return Promise.all(
                      cacheNames.map(function(cacheName) {
                        console.log('Deleting cache: ', cacheName);
                        return caches.delete(cacheName);
                      })
                    );
                  });
                }
                
                // Prevent any new service worker registration
                navigator.serviceWorker.register = function() {
                  console.log('Service worker registration blocked');
                  return Promise.reject('Service worker registration blocked');
                };
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
