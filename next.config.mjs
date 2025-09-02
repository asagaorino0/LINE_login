// next.config.mjs  ←この名前でOK（ESM）
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
].join("; "); // ← 改行を消して1行にまとめるのがポイント

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    allowedDevOrigins: ["https://d355b4a47e59.ngrok-free.app"],
  },
};

export default nextConfig;
