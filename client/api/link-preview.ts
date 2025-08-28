// /api/link-preview.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const normalizeFormUrl = (url: string): string => {
  if (!url) return url;
  try { url = decodeURIComponent(url); } catch { }
  url = url.trim();

  const tokenMatch = url.match(/(1FAIpQL[0-9A-Za-z_-]+)/);
  if (tokenMatch) {
    const token = tokenMatch[1];
    if (url.includes('/forms/d/e/')) return `https://docs.google.com/forms/d/e/${token}/viewform`;
    if (url.includes('/forms/d/')) return `https://docs.google.com/forms/d/${token}/viewform`;
    return `https://docs.google.com/forms/d/e/${token}/viewform`;
  }
  if (/https?:\/\/forms\.gle\//.test(url)) return url;
  if (/https?:\/\/docs\.google\.com\/forms\/d\/(e\/)?[A-Za-z0-9_-]+\/viewform/.test(url)) {
    return url.split('?')[0];
  }
  return url;
};

const extractTitleFromHtml = (html: string): string | undefined => {
  const t1m = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const t1 = t1m && t1m[1] ? t1m[1].replace(/ - Google フォーム$/, '').trim() : undefined;
  if (t1) return t1;
  const t2m = html.match(/freebirdFormviewerViewHeaderTitle[^>]*>(.*?)<\/div>/);
  return t2m && t2m[1] ? t2m[1].trim() : undefined;
};

const extractMetaDescription = (html: string): string | undefined => {
  const m = html.match(/<meta[^>]+itemprop=["']description["'][^>]+content=["']([^"']+)["']/i);
  return m && m[1] ? m[1].trim() : undefined;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  const { form: rawFormUrl, desc, image, title: titleOverride, v } = req.query as Record<string, string>;
  if (!rawFormUrl) return res.status(400).send('Missing ?form=');

  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host;
  const path = req.url!.split('?')[0];
  const shareUrl = `${proto}://${host}${path}?${new URLSearchParams(req.query as any)}`;

  const formUrl = normalizeFormUrl(rawFormUrl);
  let ogTitle = titleOverride || 'Googleフォーム';
  let ogDesc = desc || 'リンクを開くにはこちらをタップ';
  const ogImage = image || `${proto}://${host}/og-default.png`; // 好きな画像に差し替え

  // 可能ならフォームからタイトル/説明を抽出（失敗してもOK）
  try {
    const r = await fetch(formUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await r.text();
    if (!titleOverride) {
      const t = extractTitleFromHtml(html);
      if (t) ogTitle = t;
    }
    if (!desc) {
      const d = extractMetaDescription(html);
      if (d) ogDesc = d;
    }
  } catch (e) {
    console.warn('fetch form failed:', (e as Error).message);
  }

  const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(ogTitle)}</title>

<meta property="og:title" content="${escapeHtml(ogTitle)}" />
<meta property="og:description" content="${escapeHtml(ogDesc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtml(shareUrl)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta name="twitter:card" content="summary_large_image" />

<meta http-equiv="refresh" content="0; url=${escapeHtml(formUrl)}" />
</head>
<body>
<p><a href="${escapeHtml(formUrl)}">リンクを開く</a></p>
<script>location.replace(${JSON.stringify(formUrl)});</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=600');
  res.status(200).send(page);
}
