// app/api/whoami/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const uid = (await cookies()).get("uid")?.value || null;
  return NextResponse.json(
    { hasUid: !!uid, uidMasked: uid ? uid.slice(0, 6) + "…" : null },
    { status: 200 }
  );
}
