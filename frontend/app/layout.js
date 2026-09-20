import "./globals.css";
import Providers from "@/components/providers";

export const metadata = { title: { default: "Nexus", template: "%s · Nexus" }, description: "Study from your own materials, with answers you can check." };
export const viewport = { width: "device-width", initialScale: 1 };
// Rendered per request so the middleware's CSP nonce is applied to Next's own scripts.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
