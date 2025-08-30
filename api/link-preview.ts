import type { VercelRequest, VercelResponse } from '@vercel/node';

const isCrawler = (ua: string | undefined) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  return /line|facebook|twitter|slack|discord|bot|crawler|spider|embed/i.test(s);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = req.query.form as string | undefined;
    const title = (req.query.title as string) || '公式LINE連携_Googleフォーム';
    const desc = (req.query.desc as string) || 'リンクを開くにはこちらをタップ';
    const image = (req.query.image as string) || 'https://example.com/og-image.png';
    const notify = (req.query.notify as string) === '0' ? '0' : '1'; // ★ add

    if (!form) {
      res.status(400).send('Missing "form" parameter');
      return;
    }

    const proto = (req.headers['x-forwarded-proto'] ?? 'https') as string;
    const host = req.headers.host;
    const appUrl =
      `${proto}://${host}/?form=${encodeURIComponent(form)}&redirect=true&notify=${notify}`; // ★ notify を引き継ぐ

    const ua = req.headers['user-agent'] as string | undefined;

    if (!isCrawler(ua)) {
      // 人間のブラウザ → アプリに 302
      res.status(302).setHeader('Location', appUrl).end();
      return;
    }

    // クローラー → OG を返す
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${appUrl}"/>
<meta property="og:image" content="${image}"/>
<title>${title}</title>
</head>
<body>
<p>${desc}</p>
</body>
</html>`);
  } catch (e) {
    console.error(e);
    res.status(500).send('link-preview error');
  }
}
