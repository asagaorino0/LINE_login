// app/api/token/issue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { makePayload, signToken } from "@/lib/token";
import { getBaseUrl } from "@/lib/getBaseUrl";

async function fetchLinkByLid(lid: string) {
  const base =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://line-login-self.vercel.app"; // デプロイURLを明示
  const r = await fetch(`${base}/api/links/${encodeURIComponent(lid)}`, {
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.ok ? j : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "");
    const lid = String(body?.lid || "");

    if (!uid || !lid) {
      return NextResponse.json({ ok: false, error: "MISSING_PARAMS" }, { status: 400 });
    }

    // lid の有効性確認
    const link = await fetchLinkByLid(lid);
    if (!link) {
      return NextResponse.json({ ok: false, error: "LID_NOT_FOUND" }, { status: 404 });
    }

    const secret = process.env.TOKEN_SECRET || "";
    if (!secret) {
      return NextResponse.json({ ok: false, error: "NO_SERVER_SECRET" }, { status: 500 });
    }

    const ttl = Number(process.env.TOKEN_TTL_SECONDS || "300"); // 有効期限5分
    const payload = makePayload(uid, lid, ttl);
    const token = signToken(payload, secret);

    // ✅ サーバー側では location は使えないので、環境変数から取得
    const base =
      getBaseUrl() ||
      process.env.BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://line-login-self.vercel.app";

    const redirectUrl = `${base}/r/${encodeURIComponent(token)}`;

    return NextResponse.json({ ok: true, token, redirectUrl, exp: payload.exp });
  } catch (e: any) {
    console.error("[token/issue] error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
