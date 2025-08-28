// /api/link-preview.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const isCrawler = (ua?: string) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  // 人間の LINE WebView は除外、クローラー/プレビューボットのみ許可
  return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|linebot|whatsapp|telegrambot/i.test(s);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = typeof req.query.form === 'string' ? req.query.form : undefined; // Googleフォームの viewform
    const title = (req.query.title as string) || '公式LINE連携_Googleフォーム';
    const desc = (req.query.desc as string) || 'リンクを開くにはこちらをタップ';
    const image = (req.query.image as string) || 'https://example.com/og-image.png';

    if (!form) {
      res.status(400).send('Missing "form" parameter');
      return;
    }

    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = req.headers.host;
    const origin = `${proto}://${host}`;

    // アプリ（フロント）に渡して自動遷移させる先
    const appUrl = `${origin}/?form=${encodeURIComponent(form)}&redirect=true`;

    const ua = req.headers['user-agent'] as string | undefined;

    // 人がタップしたときは 302 でアプリへ（そこで自動でフォームを開く）
    if (!isCrawler(ua)) {
      res.status(302).setHeader('Location', appUrl).end();
      return;
    }

    // クローラー用に OG を返す（ここでは遷移させない）
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="${escapeHtml(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${appUrl}"/>
<meta property="og:image" content="${image}"/>
<title>${escapeHtml(title)}</title>
</head>
<body>
<p>${escapeHtml(desc)}</p>
</body>
</html>`);
  } catch (e) {
    console.error('link-preview error:', e);
    res.status(500).send('link-preview error');
  }
}

// 最低限のエスケープ（XSS/OG崩れ防止）
function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
