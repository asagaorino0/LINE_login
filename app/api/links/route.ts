// app/api/links/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getLinksByIdContainer } from "@/lib/cosmos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORM_ID_RE = /\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//;

function extractFormId(url: string) {
  return url.match(FORM_ID_RE)?.[1] ?? null;
}
function getPublicOrigin(req: NextRequest) {
  const env = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_ORIGIN;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const originHdr = h.get("origin");
  if (originHdr?.startsWith("http")) return originHdr;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  // ping 動作は残すとデバッグ便利
  if (req.nextUrl.searchParams.get("ping") === "1") {
    return NextResponse.json({ ok: true, code: "PING_OK", route: "/api/links" }, { status: 200 });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const form: string = typeof body.form === "string" ? body.form : "";
    const title: string = typeof body.title === "string" ? body.title : "";
    const desc: string = typeof body.desc === "string" ? body.desc : "";
    const notify: number = body.notify ? 1 : 0;
    const aid: string = typeof body.aid === "string" ? body.aid : "";
    const basicIdRaw: string = typeof body.basicId === "string" ? body.basicId.trim() : "";

    if (!form) return NextResponse.json({ ok: false, code: "NO_FORM" }, { status: 400 });
    const formId = extractFormId(form);
    if (!formId) return NextResponse.json({ ok: false, code: "BAD_FORM_URL" }, { status: 400 });
    if (!aid) return NextResponse.json({ ok: false, code: "NO_ADMIN_ID" }, { status: 401 });

    // notify=1 のときだけ basicId 必須＆正規化
    let normBasicId: string | null = null;
    if (notify) {
      if (!basicIdRaw) return NextResponse.json({ ok: false, code: "NO_BASIC_ID" }, { status: 400 });
      normBasicId = basicIdRaw.startsWith("@") ? basicIdRaw : `@${basicIdRaw}`;
    }

    const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const now = Math.floor(Date.now() / 1000);

    const item: any = {
      id: lid,
      aid,
      formUrl: form,
      formId,
      title,
      desc,
      notify,
      createdAt: now,
      expiresAt: Number(body.expiresAt || 0) || 0,
    };
    if (normBasicId) item.basicId = normBasicId;

    await getLinksByIdContainer().items.upsert(item);

    const origin = getPublicOrigin(req);
    return NextResponse.json({ ok: true, link: `${origin}/open?lid=${lid}`, lid }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, code: "LINKS_CREATE_FAILED" }, { status: 500 });
  }
}
