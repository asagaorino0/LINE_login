// app/api/link-preview/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

/** 公開オリジンを確実に求める（ngrok/プロキシ対応） */
function getPublicOrigin(req: NextRequest) {
  const xfProto = req.headers.get('x-forwarded-proto'); // 例: "https"
  const xfHost = req.headers.get('x-forwarded-host');  // 例: "xxxx.ngrok-free.app"
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

/** UA helpers */
const isCrawler = (ua?: string | null) =>
  !!ua && /(bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|linebot)/i.test(ua.toLowerCase());

const isLikelyInAppHuman = (ua?: string | null) =>
  !!ua && /(line(?!bot)|fbav|fban|instagram|wv)/i.test(ua.toLowerCase());

/** エスケープ（TS安全版） */
const ESC_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
} as const;
type EscKey = keyof typeof ESC_MAP;

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ESC_MAP[ch as EscKey]);
const escAttr = (s: string) => s.replace(/"/g, ESC_MAP['"']);

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const origin = getPublicOrigin(req); // ← ここがポイント

    const form = url.searchParams.get('form');
    const title = url.searchParams.get('title') ?? '公式LINE連携_Googleフォーム';
    const desc = url.searchParams.get('desc') ?? '';
    const image = url.searchParams.get('image') ?? `${origin}/line-preview.png`;
    const notify: '0' | '1' = url.searchParams.get('notify') === '1' ? '1' : '0';

    if (!form) {
      return NextResponse.json({ error: 'Missing "form" parameter' }, { status: 400 });
    }

    // 目的地 URL（常に公開オリジン基準）
    const appUrl = new URL('/', origin);
    appUrl.search = new URLSearchParams({ form, redirect: 'true', notify }).toString();

    const ua = req.headers.get('user-agent');

    // 1) クローラーには OG を返す（プレビュー用）
    if (isCrawler(ua)) {
      const html = `<!doctype html><html lang="ja"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${escAttr(appUrl.toString())}"/>
<meta property="og:image" content="${escAttr(image)}"/>
<title>${esc(title)}</title>
</head><body>
<p style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:16px;">
  ${esc(desc)}
</p>
</body></html>`;
      return new NextResponse(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=60, s-maxage=60',
        },
      });
    }

    // 2) アプリ内ブラウザなど：HTMLで即時遷移（フォールバックリンク付き）
    if (isLikelyInAppHuman(ua)) {
      const dest = appUrl.toString();
      const html = `<!doctype html><html lang="ja"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>開いています…</title>
<meta http-equiv="refresh" content="0;url=${escAttr(dest)}">
<script>location.replace(${JSON.stringify(dest)});</script>
</head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <p style="margin:16px;">自動的に開かない場合は <a href="${escAttr(dest)}">こちらをタップ</a> してください。</p>
</body></html>`;
      return new NextResponse(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    // 3) それ以外は 302 でリダイレクト
    return NextResponse.redirect(appUrl, { status: 302 });
  } catch (e) {
    console.error('link-preview error', e);
    return NextResponse.json({ error: 'link-preview error' }, { status: 500 });
  }
}
