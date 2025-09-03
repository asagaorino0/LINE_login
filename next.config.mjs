// next.config.mjs
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.line-scdn.net https://cdn.ngrok.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.line-scdn.net https://profile.line-scdn.net",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://access.line.me https://api.line.me https://liffsdk.line-scdn.net https://api.allorigins.win https://corsproxy.io",
  "frame-src 'self' https://access.line.me https://accounts.google.com",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // 開発中に ngrok で /_next/* を読ませるため（本番には無関係）
    allowedDevOrigins: ["https://d355b4a47e59.ngrok-free.app"],
  },
  async headers() {
    return [
      {
        // 全ページに CSP を付与
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
