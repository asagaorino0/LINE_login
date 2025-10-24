// app/r/[token]/route.ts
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/token";

// ✅ Next.js の正しいシグネチャ： (request: Request, context: { params: {...} })
export async function GET(
  _req: Request,
  context: { params: { token: string } }
) {
  try {
    const token = context.params?.token;
    if (!token) {
      return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
    }

    const secret = process.env.TOKEN_SECRET;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "NO_TOKEN_SECRET" }, { status: 500 });
    }

    const payload = verifyToken(token, secret) as
      | { uid?: string; lid?: string; exp?: number }
      | null;

    if (!payload?.uid || !payload?.lid) {
      return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
    }

    // リンク情報を取得（公開URL or 環境変数）
    const base =
      process.env.BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const linkResp = await fetch(`${base}/api/links/${encodeURIComponent(payload.lid)}`, {
      cache: "no-store",
    });
    if (!linkResp.ok) {
      return NextResponse.json({ ok: false, error: "LINK_NOT_FOUND" }, { status: 404 });
    }
    const link = await linkResp.json();
    const entry = String(link.entry || "")
      .trim()
      .replace(/^entry\./, "");
    if (!entry) {
      return NextResponse.json({ ok: false, error: "ENTRY_NOT_SET" }, { status: 400 });
    }

    // Googleフォームの view URL（? 以降を落として再構築）
    const formBase = String(link.formUrl || "").split("?")[0];
    const redirectUrl = `${formBase}?usp=pp_url&entry.${entry}=${encodeURIComponent(payload.uid!)}`;

    // ✅ UID を埋めたフォームに 302 リダイレクト
    return NextResponse.redirect(redirectUrl, { status: 302 });
  } catch (e: any) {
    console.error("[r/[token]] error:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
