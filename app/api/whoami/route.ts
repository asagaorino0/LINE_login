// app/api/whoami/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

function mask(s: string) {
  if (!s) return "";
  return s.length <= 6 ? "******" : `${s.slice(0, 2)}…${s.slice(-2)}`;
}

export async function GET(_req: NextRequest) {
  const jar = await cookies();
  const uid = jar.get("uid")?.value ?? null;

  // ここは絶対に 200 を返す（未ログインでも 200）
  return NextResponse.json(
    {
      hasUid: Boolean(uid),
      uidMasked: uid ? mask(uid) : undefined,
    },
    { status: 200 }
  );
}
