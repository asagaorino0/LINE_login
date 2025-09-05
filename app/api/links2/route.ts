// app/api/links2/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return NextResponse.json(
    { ok: true, code: "HIT_LINKS2_POST", url: req.nextUrl.toString() },
    { status: 200 }
  );
}
export async function GET() {
  return NextResponse.json({ ok: true, code: "HIT_LINKS2_GET" }, { status: 200 });
}
