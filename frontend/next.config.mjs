// The browser only ever talks to this origin; /api/* is forwarded to the FastAPI backend (same origin: no CORS, cookies just work).
const API_ORIGIN = process.env.API_ORIGIN || "http://127.0.0.1:8100";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next", // the E2E build goes elsewhere so it never replaces the app you are running
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    middlewareClientMaxBodySize: '50mb',
  },
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
