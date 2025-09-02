// app/api/whoami/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const uid = (await cookies()).get("uid")?.value || null;
  return NextResponse.json({
    ok: true,
    hasUid: Boolean(uid),
    uidMasked: uid ? uid.slice(0, 6) + "…" : null,
  });
}
