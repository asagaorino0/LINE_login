// app/open/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getLinksByIdContainer } from "@/lib/cosmos";
import { sign } from "@/lib/linkSign";

const BOT_UA = /(facebookexternalhit|Twitterbot|Slackbot|Line|WhatsApp|Discordbot|preview|crawler|spider|Google-InspectionTool)/i;

function esc(s: string) {
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]!));
}
function buildBase(req: NextRequest) {
  const env = process.env.PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const proto = (req.nextUrl.protocol || "https:").replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const lid = sp.get("lid");

  // ① lid 指定があれば Cosmos から復元
  if (lid) {
    const c = getLinksByIdContainer();
    const { resource: doc } = await c.item(lid, lid).read<{
      id: string;
      aid: string;
      formId: string;
      formUrl: string;
      title?: string | null;
      desc?: string | null;
      expiresAt: number; // 0=無期限
      disabled?: boolean;
    }>();

    if (!doc) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    if (doc.disabled) return NextResponse.json({ ok: false, code: "DISABLED" }, { status: 410 });
    const now = Math.floor(Date.now() / 1000);
    if (doc.expiresAt && doc.expiresAt > 0 && doc.expiresAt < now) {
      return NextResponse.json({ ok: false, code: "EXPIRED" }, { status: 410 });
    }

    // 署名を「毎回」発行（例: 15分）
    const exp = now + 15 * 60;
    const sig = sign(doc.aid, doc.formId, exp);

    const q =
      `form=${encodeURIComponent(doc.formUrl)}&notify=1` +
      `&aid=${encodeURIComponent(doc.aid)}&formId=${encodeURIComponent(doc.formId)}` +
      `&exp=${exp}&sig=${encodeURIComponent(sig)}` +
      (doc.title ? `&title=${encodeURIComponent(doc.title)}` : "") +
      (doc.desc ? `&desc=${encodeURIComponent(doc.desc)}` : "");

    const appUrl = `${buildBase(req)}/?${q}`;
    const isBot = BOT_UA.test(req.headers.get("user-agent") || "");
    const title = doc.title || "Googleフォーム";
    const desc = doc.desc || "フォームに回答してください。";

    const html = `<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${buildBase(req)}/open?lid=${encodeURIComponent(lid)}">
<meta name="twitter:card" content="summary_large_image">
${isBot ? "" : `<meta http-equiv="refresh" content="0;url=${esc(appUrl)}">`}
</head><body>
${isBot ? `<p>プレビュー用ページです。</p>` : `<noscript><a href="${esc(appUrl)}">開く</a></noscript>`}
</body></html>`;
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  // ② 後方互換（旧: /open?form=...&aid=...&sig=...）も一応通す
  const form = sp.get("form") || "";
  const title = sp.get("title") || "Googleフォーム";
  const desc = sp.get("desc") || "フォームに回答してください。";
  const isBot = BOT_UA.test(req.headers.get("user-agent") || "");
  const appUrl = `${buildBase(req)}/?${sp.toString()}`;

  const html = `<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${buildBase(req)}/open?${sp.toString()}">
<meta name="twitter:card" content="summary_large_image">
${isBot ? "" : `<meta http-equiv="refresh" content="0;url=${esc(appUrl)}">`}
</head><body>
${isBot ? `<p>プレビュー用ページです。</p>` : `<noscript><a href="${esc(appUrl)}">開く</a></noscript>`}
</body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
