// client/api/link-preview.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** できるだけ “bot だけ” を判定する。人間を巻き込まない */
const isCrawler = (ua?: string) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  // 代表的なプレビュー・クローラーのみ列挙
  return /(bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|linebot)/i.test(s);
};

/** アプリ内ブラウザ（人間）っぽい UA を拾う（LINE/Instagram/Facebook WebView など） */
const isLikelyInAppHuman = (ua?: string) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  // “line” は人間の WebView にも入るが、linebot には入らない
  return /(line(?!bot)|fbav|fban|instagram|wv)/i.test(s);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = req.query.form as string | undefined; // viewform (URLエンコード済みOK)
    const title = (req.query.title as string) || '公式LINE連携_Googleフォーム';
    const desc = (req.query.desc as string) || 'リンクを開くにはこちらをタップ';
    const image = (req.query.image as string) || 'https://example.com/og-image.png';

    if (!form) {
      res.status(400).send('Missing "form" parameter');
      return;
    }

    // このアプリ経由で自動遷移させる先
    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
    const host = req.headers.host;
    const appUrl = `${proto}://${host}/?form=${encodeURIComponent(form)}&redirect=true`;

    const ua = req.headers['user-agent'] as string | undefined;

    // ---- 配信ポリシー ----
    // 1) 純粋なクローラー ⇒ OG HTML を返す
    if (isCrawler(ua)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // 共有プレビューのキャッシュが強烈なので一応短めに
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      res.status(200).send(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="${escapeHtml(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${appUrl}"/>
<meta property="og:image" content="${escapeAttr(image)}"/>
<title>${escapeHtml(title)}</title>
</head>
<body>
<p style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:16px;">
  ${escapeHtml(desc)}
</p>
</body>
</html>`);
      return;
    }

    // 2) 人間のアプリ内ブラウザ（LINE 等）の可能性が高い ⇒ 念のため HTML で即時リダイレクト
    //    一部 WebView で 302 が効かないケースの保険
    if (isLikelyInAppHuman(ua)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>開いています…</title>
<meta http-equiv="refresh" content="0;url=${escapeAttr(appUrl)}">
<script>location.replace(${JSON.stringify(appUrl)});</script>
</head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <p style="margin:16px;">自動的に開かない場合は <a href="${escapeAttr(appUrl)}">こちらをタップ</a> してください。</p>
</body>
</html>`);
      return;
    }

    // 3) それ以外（通常ブラウザ） ⇒ 302 リダイレクト
    res.status(302).setHeader('Location', appUrl).end();
  } catch (e) {
    console.error(e);
    res.status(500).send('link-preview error');
  }
}

/** XSS 回避の最低限のエスケープ */
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]
  );
}
function escapeAttr(s: string) {
  // 属性値用：ダブルクォートは特に避ける
  return s.replace(/"/g, '&quot;');
}
