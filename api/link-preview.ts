// api/link-preview.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ❌ ここに line が入っていると、人間の LINE アプリ内ブラウザまでボット扱いになる
// const isCrawler = (ua?: string) => ua ? /line|facebook|twitter|slack|discord|bot|crawler|spider|embed/i.test(ua.toLowerCase()) : false;

// ✅ ボット UA だけに絞る（主要どころ）
const isCrawler = (ua?: string) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  return /(bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot)/i.test(s);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = req.query.form as string | undefined;
    const title = (req.query.title as string) || '公式LINE連携_Googleフォーム';
    const desc = (req.query.desc as string) || 'リンクを開くにはこちらをタップ';
    const image = (req.query.image as string) || 'https://example.com/og-image.png';
    const notify = (req.query.notify as string) === '1' ? '1' : '0'; // 任意: 通知ON/OFFを引き継ぐ

    if (!form) {
      res.status(400).send('Missing "form" parameter');
      return;
    }

    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
    const host = req.headers.host;
    const appUrl =
      `${proto}://${host}/?form=${encodeURIComponent(form)}&redirect=true&notify=${notify}`;

    const ua = req.headers['user-agent'] as string | undefined;

    // 人間のブラウザ → 即リダイレクト
    if (!isCrawler(ua)) {
      res.status(302).setHeader('Location', appUrl).end();
      return;
    }

    // クローラー → OGを返す（念のため自動遷移のフォールバックも同梱）
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
<!-- フォールバック：一部クライアントが人間なのにボット判定されても遷移できるように -->
<meta http-equiv="refresh" content="1;url=${appUrl}">
<script>setTimeout(function(){ location.replace(${JSON.stringify(appUrl)}); }, 0);</script>
</head>
<body>
<p>${desc}</p>
<p><a href="${appUrl}">開けない場合はこちらをタップ</a></p>
</body>
</html>`);
  } catch (e) {
    console.error(e);
    res.status(500).send('link-preview error');
  }
}
