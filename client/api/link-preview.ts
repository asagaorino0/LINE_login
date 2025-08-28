// client/api/link-preview.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const isCrawler = (ua: string | undefined) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  return /line|facebook|twitter|slack|discord|bot|crawler|spider|embed/i.test(s);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = req.query.form as string | undefined;               // ここは“viewform”(URLエンコード済OK)
    const title = (req.query.title as string) || '公式LINE連携_Googleフォーム';
    const desc = (req.query.desc as string) || 'リンクを開くにはこちらをタップ';
    const image = (req.query.image as string) || 'https://example.com/og-image.png';

    if (!form) {
      res.status(400).send('Missing "form" parameter');
      return;
    }

    // このアプリ経由で自動遷移させる先（Home が拾う）
    const appUrl = `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers.host}/?form=${encodeURIComponent(form)}&redirect=true`;

    const ua = req.headers['user-agent'] as string | undefined;

    // 1) 人間のブラウザなら、アプリに 302 で送る（自動でフォームが開く流れに乗る）
    if (!isCrawler(ua)) {
      res.status(302).setHeader('Location', appUrl).end();
      return;
    }

    // 2) クローラー(LINE など)なら OG HTML を返す（ここでは遷移させない）
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
