// app/api/make-link/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sign } from "@/lib/linkSign";

function buildBase(req: NextRequest): string {
  // ① 環境変数があれば最優先（localhost で生成しても ngrok を返す）
  const fromEnv =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_PUBLIC_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  // ② プロキシヘッダ（Vercel/ngrok）
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;

  // ③ 最後の手段
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  try {
    const { form, ttlHours = 6, adminId } = (await req.json()) as {
      form: string; ttlHours?: number; adminId?: string;
    };
    if (!form) return NextResponse.json({ ok: false, code: "NO_FORM" }, { status: 400 });

    // 管理者IDの解決：cookie.uid 優先、なければ許可リストの adminId
    const jar = await cookies();
    let aid = jar.get("uid")?.value ?? null;
    if (!aid) {
      const allow = (process.env.LINE_ADMIN_IDS ?? "")
        .split(",").map(s => s.trim()).filter(Boolean);
      if (adminId && allow.includes(adminId)) aid = adminId;
    }
    if (!aid) return NextResponse.json({ ok: false, code: "NO_ADMIN_ID" }, { status: 401 });

    const m = form.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//);
    if (!m) return NextResponse.json({ ok: false, code: "BAD_FORM_URL" }, { status: 400 });
    const formId = m[1];

    const exp = Math.floor(Date.now() / 1000) + Math.floor(Number(ttlHours)) * 3600;
    const sig = sign(aid, formId, exp);

    const base = buildBase(req);
    const link =
      `${base}/?form=${encodeURIComponent(form)}&notify=1` +
      `&aid=${aid}&formId=${formId}&exp=${exp}&sig=${sig}`;

    return NextResponse.json({ ok: true, link, aid, formId, exp });
  } catch (e: any) {
    console.error("/api/make-link error:", e);
    return NextResponse.json({ ok: false, code: "ERROR", message: e?.message ?? "error" }, { status: 500 });
  }
}
