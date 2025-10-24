// app/r/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/token"; // 署名検証関数（後述）
import { getBaseUrl } from "@/lib/getBaseUrl";

// 🔐 トークン検証 → 有効ならリダイレクト
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    if (!token) throw new Error("MISSING_TOKEN");

    const secret = process.env.TOKEN_SECRET;
    if (!secret) throw new Error("NO_TOKEN_SECRET");

    // 署名検証して UID と LID を取得
    const payload = verifyToken(token, secret);
    if (!payload?.uid || !payload?.lid) {
      throw new Error("INVALID_PAYLOAD");
    }

    // Cosmos や API などからリンク情報を取得
    const base =
      process.env.BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      getBaseUrl();
    const linkResp = await fetch(`${base}/api/links/${payload.lid}`, {
      cache: "no-store",
    });
    if (!linkResp.ok) throw new Error("LINK_NOT_FOUND");

    const link = await linkResp.json();
    const entry = link.entry?.startsWith("entry.")
      ? link.entry
      : `entry.${link.entry}`;

    // GoogleフォームURL生成
    const formBase = link.formUrl.split("?")[0];
    const redirectUrl = `${formBase}?usp=pp_url&${entry}=${encodeURIComponent(
      payload.uid
    )}`;

    // ✅ UIDを埋めたフォームURLへリダイレクト
    return NextResponse.redirect(redirectUrl, 302);
  } catch (e: any) {
    console.error("[r/token] error:", e);
    return NextResponse.json(
      { ok: false, error: e.message || String(e) },
      { status: 500 }
    );
  }
}
