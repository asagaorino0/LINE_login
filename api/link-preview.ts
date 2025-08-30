import type { VercelRequest, VercelResponse } from '@vercel/node';

/** ---- UA helpers -------------------------------------------------------- */
const isCrawler = (ua?: string) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  // “line” は人間の WebView にも含まれるため含めない。主要ボットのみ。
  return /(bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|linebot)/i.test(s);
};

const isLikelyInAppHuman = (ua?: string) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  // LINE/FB/Instagram のアプリ内ブラウザっぽいUA
  return /(line(?!bot)|fbav|fban|instagram|wv)/i.test(s);
};

/** ---- utils ------------------------------------------------------------- */
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);

const escapeAttr = (s: string) => s.replace(/"/g, '&quot;');

const buildAppUrl = (req: VercelRequest, form: string, notify: '0' | '1') => {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = req.headers.host;
  const base = `${proto}://${host}`;
  return `${base}/?form=${encodeURIComponent(form)}&redirect=true&notify=${notify}`;
};

/** ---- handler ----------------------------------------------------------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = req.query.form as string | undefined;
    const title = (req.query.title as string) || '公式LINE連携_Googleフォーム';
    const desc = (req.query.desc as string) || 'リンクを開くにはこちらをタップ';
    const image = (req.query.image as string) || 'https://example.com/og-image.png';
    const notify: '0' | '1' = (req.query.notify as string) === '1' ? '1' : '0';

    if (!form) {
      res.status(400).send('Missing "form" parameter');
      return;
    }

    const ua = req.headers['user-agent'] as string | undefined;
    const appUrl = buildAppUrl(req, form, notify);

    // 1) 純粋なクローラー：OGを返す
    if (isCrawler(ua)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
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

    // 2) アプリ内ブラウザ等：HTMLで即時遷移（302が効かない端末向けフォールバック）
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

    // 3) それ以外：302で遷移
    res.status(302).setHeader('Location', appUrl).end();
  } catch (e) {
    console.error(e);
    res.status(500).send('link-preview error');
  }
}
