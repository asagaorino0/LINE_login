// // app/api/line-admin/route.ts
// import { NextRequest, NextResponse } from "next/server";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// export async function POST(req: NextRequest) {
//   const { lineUserId } = await req.json();

//   if (!/^U[0-9a-f]{32,}$/i.test(lineUserId)) {
//     return NextResponse.json({ ok: false, code: "BAD_UID" }, { status: 400 });
//   }

//   const res = NextResponse.json({ ok: true });
//   res.cookies.set("uid", lineUserId, {
//     httpOnly: true,
//     sameSite: "lax",
//     secure: true,       // 本番は true
//     path: "/",
//     maxAge: 60 * 60 * 24 * 30,
//   });
//   return res;
// }
// app/api/line-admin/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const lineUserId: string = body.lineUserId;

  const res = NextResponse.json({ ok: true });

  res.cookies.set("uid", lineUserId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}


