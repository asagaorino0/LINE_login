// app/api/line-admin/route.ts
import { NextRequest, NextResponse } from "next/server";
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { lineUserId } = await req.json();
  if (!/^U[0-9a-f]{32,}$/i.test(lineUserId)) {
    return NextResponse.json({ ok: false, code: "BAD_UID" }, { status: 400 });
  }
  (await cookies()).set("uid", lineUserId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,      // ngrok(https)ならtrueでOK。localhostならfalseでも可
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true });
}
