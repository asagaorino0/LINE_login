// lib/formsMeta.ts
const VIEW_RE = /\/viewform(?:\?.*)?$/i;

// Googleフォームの「viewform」URLに正規化
export function toViewUrl(raw: string) {
  try {
    const u = new URL(raw);
    // /viewform で終わらせる（/edit 等は view に寄せる）
    const parts = u.pathname.split("/");
    parts[parts.length - 1] = "viewform";
    u.pathname = parts.join("/");
    u.search = "";
    return u.toString();
  } catch {
    return raw;
  }
}

export async function fetchFormMeta(formUrlRaw: string): Promise<{ title?: string; desc?: string }> {
  const url = toViewUrl(formUrlRaw);
  const res = await fetch(url, {
    headers: {
      // CF等で弾かれにくいUA
      "User-Agent": "Mozilla/5.0 (compatible; MetaFetcher/1.0; +https://example.com)"
    },
    cache: "no-store",
  });
  if (!res.ok) return {};

  const html = await res.text();

  // ① og:title / og:description
  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
  const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1];

  // ② <title> フォールバック
  const docTitle = html.match(/<title>([^<]*)<\/title>/i)?.[1];

  // ③ さらにフォールバック（Googleフォーム本文の先頭テキストに近い箇所）
  const nameFromH1 = html.match(/<div[^>]*role=["']heading["'][^>]*aria-level=["']1["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const title = (ogTitle || docTitle || nameFromH1 || "").trim();
  const desc = (ogDesc || "").trim();

  return { title, desc };
}
