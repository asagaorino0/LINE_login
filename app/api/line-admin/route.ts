// app/api/line-admin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UID_RE = /^U[0-9a-f]{32,}$/i;

export async function POST(req: NextRequest) {
  let json: any;
  try { json = await req.json(); } catch {
    return NextResponse.json({ ok: false, code: "BAD_JSON" }, { status: 400 });
  }
  const id = json?.lineUserId;
  if (typeof id !== "string" || !UID_RE.test(id)) {
    return NextResponse.json({ ok: false, code: "BAD_UID" }, { status: 400 });
  }

  const secure = process.env.NODE_ENV === "production";
  (await cookies()).set({
    name: "uid",
    value: id,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
