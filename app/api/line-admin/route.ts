// app/api/line-admin/route.ts
import { NextResponse } from "next/server";
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 既存の処理そのまま。Cosmos を触る箇所は try/catch でログを出すとなお良し


export async function POST(req: Request) {
  const body = await req.json(); // { lineUserId, ... }

  // 必要ならホワイトリスト判定
  const allow = (process.env.LINE_ADMIN_IDS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(body.lineUserId)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
