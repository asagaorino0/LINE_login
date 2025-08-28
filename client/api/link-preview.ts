// /api/link-preview.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const isCrawler = (ua: string | undefined) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  // LINE/Twitter/FB/Slack/Discord などのプレビュー取得系を検知
  return /(line|facebook|twitter|slack|discord|bot|crawler|spider|embed)/i.test(s);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = req.query.form as string | undefined; // viewform のURL（エンコード済OK）
    const title = (req.query.title as string) || '公式LINE連携_Googleフォーム';
    const desc = (req.query.desc as string) || 'リンクを開くにはこちらをタップ';
    const image = (req.query.image as string) || 'https://example.com/og-image.png';

    if (!form) {
      res.status(400).send('Missing "form" parameter');
      return;
    }

    // このアプリ（/ の Home）に渡して自動遷移させるリンクを作成
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = req.headers.host as string;
    const appUrl = `${proto}://${host}/?form=${encodeURIComponent(form)}&redirect=true`;

    const ua = req.headers['user-agent'] as string | undefined;

    // 人のブラウザ → Home へ 302 リダイレクト（自動でフォームを開くフローに乗せる）
    if (!isCrawler(ua)) {
      res.status(302).setHeader('Location', appUrl).end();
      return;
    }

    // クローラー（LINE など）→ OG メタを差し込んだ HTML を返す
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
