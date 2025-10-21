// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/open")) return NextResponse.next();

  // すでに LIFF ドメインから来てるなら素通し（通常ここには来ない想定）
  if (req.headers.get("host")?.endsWith("liff.line.me")) return NextResponse.next();

  // 1) 優先度: クエリの liff / liffId
  let liffId = url.searchParams.get("liff") || url.searchParams.get("liffId") || "";

  // 2) なければ lid から /api/links/:lid を引いて取得（ここに最新の liffId を保存しておく）
  if (!liffId) {
    const lid = url.searchParams.get("lid");
    if (lid) {
      try {
        const resp = await fetch(`${url.origin}/api/links/${lid}`, { cache: "no-store" });
        const data = await resp.json().catch(() => null as any);
        if (resp.ok && data?.ok && data?.liffId) liffId = String(data.liffId);
      } catch {/* ignore */ }
    }
  }

  // 3) 最後の保険（任意）：環境変数にデフォルトLIFFを置く
  if (!liffId && process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID) {
    liffId = process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID!;
  }

  // 4) 確定したらユニバーサルリンクへ 302（元のクエリは丸ごと引き継ぐ）
  if (liffId) {
    const redirectTo = `https://liff.line.me/${encodeURIComponent(liffId)}${url.search || ""}`;
    const res = NextResponse.redirect(redirectTo, 302);
    res.headers.set("cache-control", "no-store");
    return res;
  }

  // 取得失敗時のみクライアントに任せる（エラー表示など）
  return NextResponse.next();
}

export const config = { matcher: ["/open/:path*"] };