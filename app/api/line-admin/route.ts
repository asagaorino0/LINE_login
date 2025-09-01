// app/api/line-admin/route.ts
import { NextResponse } from "next/server";
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const body = await req.json(); // { lineUserId, ... }
  const allow = (process.env.LINE_ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // 許可リストチェック
  if (allow.length && !allow.includes(body.lineUserId)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!body.lineUserId) {
    return NextResponse.json({ ok: false, error: "lineUserId required" }, { status: 400 });
  }
  // クッキー属性（同一オリジン前提）
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7日
  };
  const res = NextResponse.json({ ok: true });
  // ★ これまで通り admin=1
  res.cookies.set("admin", "1", cookieOpts);
  // ★ 追加：id=管理者UID として使うための uid
  res.cookies.set("uid", body.lineUserId, cookieOpts);
  return res;
}
