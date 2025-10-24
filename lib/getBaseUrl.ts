// lib/getBaseUrl.ts
export function getBaseUrl() {
  // クライアント
  if (typeof window !== 'undefined') return window.location.origin;

  // サーバ（Node/Edge）
  // 1. 事前に設定しておく推奨
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;

  // 2. Vercel 環境ならこれで組み立て（https 前提）
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  // 3. ローカル開発
  return 'http://localhost:3000';
}
