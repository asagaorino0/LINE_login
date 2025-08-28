// client/api/link-preview.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const form = (req.query.form as string) || '';
  const title = (req.query.title as string) || '公式LINE連携_Googleフォーム';
  const desc = (req.query.desc as string) || 'リンクを開くにはこちらをタップ';

  if (!form) return res.status(400).send('Missing form param');

  // ここで「人が開いたら /?form=... に飛ばす」
  const appUrl = `/?form=${encodeURIComponent(form)}&redirect=true`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 5分キャッシュ（任意）
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  res.end(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(appUrl)}" />
  <meta property="og:image" content="https://example.com/og-image.png" />
  <title>${escapeHtml(title)}</title>
  <meta http-equiv="refresh" content="0; url='${appUrl}'" />
</head>
<body>
  <p>リンクを開いています… <a href="${appUrl}">開けない時はここをタップ</a></p>
  <script>location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
