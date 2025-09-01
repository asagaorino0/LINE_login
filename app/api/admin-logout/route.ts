// app/api/admin-logout/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  const res = NextResponse.json({ ok: true });
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" };
  res.cookies.set("admin", "", { ...opts, maxAge: 0 });
  res.cookies.set("uid", "", { ...opts, maxAge: 0 }); // ★ 追加
  return res;
}
