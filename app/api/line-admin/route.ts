// app/api/line-admin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UID_RE = /^U[0-9a-f]{32,}$/i;

const bad = (code: string, status = 400) =>
  NextResponse.json({ ok: false, code }, { status });

export async function POST(req: NextRequest) {
  let json: any;
  try {
    json = await req.json();
  } catch {
    return bad("BAD_JSON");
  }

  const lineUserId = json?.lineUserId;
  if (typeof lineUserId !== "string" || !UID_RE.test(lineUserId)) {
    return bad("BAD_UID", 400);
  }

  // ローカル(http)でも動くように。Vercel(https)では true になる。
  const secure = process.env.NODE_ENV === "production";

  const jar = await cookies();
  jar.set({
    name: "uid",
    value: lineUserId,      // 管理者の LINE UID（LIFF から来たやつ）
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30日
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
