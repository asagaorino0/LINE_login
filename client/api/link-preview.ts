import type { VercelRequest, VercelResponse } from "@vercel/node";

const isCrawler = (ua?: string) => {
  if (!ua) return false;
  const s = ua.toLowerCase();
  // LINE / Facebook / Twitter / Discord / Slack などを幅広くカバー
  return /line|facebook|twitter|slack|discord|whatsapp|telegram|bot|crawler|spider|embed|preview/i.test(s);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = (req.query.form as string) || "";
    const title = (req.query.title as string) || "公式LINE連携_Googleフォーム";
    const desc =
      (req.query.desc as string) || "リンクを開くにはこちらをタップ";
    const image =
      (req.query.image as string) ||
      "https://example.com/og-image.png"; // 必要なら差し替え

    if (!form) {
      res.status(400).send('Missing "form" parameter');
      return;
    }

    // 人間が開いた時に遷移させる “アプリ入口”
    const origin =
      (req.headers["x-forwarded-proto"] ?? "https") + "://" + req.headers.host;
    const appUrl =
      `${origin}/?form=${encodeURIComponent(form)}&redirect=true`;

    // 共有した “このURL 自体” を og:url にする（超重要）
    // これが別URLだとプレビューが別の場所を見に行きます
    const sharedUrl = origin + req.url; // 例: https://.../api/link-preview?form=...

    const ua = (req.headers["user-agent"] as string) || "";

    // ---- デバッグ用：?force=og を付けるとブラウザでもOGを返す ----
    const forceOg = req.query.force === "og";

    // ---- HEAD リクエストもクローラ扱い（LINE等はHEADを打つことがある）----
    const methodLooksCrawler = req.method === "HEAD";

    // ---- クローラ or 強制OG の場合はメタタグHTMLを返す ----
    if (forceOg || methodLooksCrawler || isCrawler(ua)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // キャッシュを強く無効化（v= を付けても、保険で）
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, max-age=0"
      );
      res.setHeader("Pragma", "no-cache");
      res.status(200).send(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="${escapeHtml(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${escapeHtml(sharedUrl)}"/>
<meta property="og:image" content="${escapeHtml(image)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(appUrl)}"/>
</head>
<body>
<p>${escapeHtml(desc)}</p>
</body>
</html>`);
      return;
    }

    // ---- それ以外（人間のブラウザ）はアプリに飛ばす ----
    res.status(302).setHeader("Location", appUrl).end();
  } catch (e) {
    console.error(e);
    res.status(500).send("link-preview error");
  }
}

// XSS/崩れ防止
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
