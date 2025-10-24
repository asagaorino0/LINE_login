// app/r/[token]/route.ts
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/token";

export async function GET(
  request: Request,
  context: any // ← 💡ここを any に変える（Next.js15は独自型を許可していません）
) {
  try {
    const token = context?.params?.token;
    if (!token) {
      return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
    }

    const secret = process.env.TOKEN_SECRET;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "NO_TOKEN_SECRET" }, { status: 500 });
    }

    const payload = verifyToken(token, secret);
    if (!payload?.uid || !payload?.lid) {
      return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
    }

    // リンク情報を取得
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
    const entry = String(link.entry || "").trim().replace(/^entry\./, "");
    if (!entry) {
      return NextResponse.json({ ok: false, error: "ENTRY_NOT_SET" }, { status: 400 });
    }

    const formBase = String(link.formUrl || "").split("?")[0];
    const redirectUrl = `${formBase}?usp=pp_url&entry.${entry}=${encodeURIComponent(payload.uid)}`;

    return NextResponse.redirect(redirectUrl, { status: 302 });
  } catch (e: any) {
    console.error("[r/[token]] error:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
