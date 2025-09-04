//app/api/links/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getLinksByIdContainer } from "@/lib/cosmos";

const FORM_ID_RE = /\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//;
const ok = (req: NextRequest, body: any, status = 200) => NextResponse.json(body, { status });
const fail = (req: NextRequest, body: any, status = 500) => NextResponse.json(body, { status });

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

type Body = {
  form?: string;
  title?: string | null;
  desc?: string | null;
  notify?: number | boolean;
  basicId?: string | null;
  expiresAt?: number | 0;
  aid: string | null
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const { form, title, desc, notify, basicId, expiresAt, aid } = body;

    // ★まず見えるログ
    console.info("[/api/links] body", {
      hasForm: !!form,
      formId: extractFormId(String(form ?? "")),
      typeofAid: typeof aid, aid,
      typeofBasicId: typeof basicId, basicId,
      typeofTitle: typeof title, typeofDesc: typeof desc,
    });

    if (!form) return fail(req, { ok: false, code: "NO_FORM" }, 400);
    const formId = extractFormId(form);
    if (!formId) return fail(req, { ok: false, code: "BAD_FORM_URL" }, 400);

    // クッキー使わないので cookies() は削除してOK

    // aid を必須にするならここで確定チェック
    if (typeof aid !== "string" || !aid) {
      return fail(req, { ok: false, code: "NO_ADMIN_ID" }, 401);
    }

    // basicId を“任意”にする実装（必須なら if (!basicId) fail する）
    const normBasicId =
      typeof basicId === "string" && basicId.trim()
        ? (basicId.trim().startsWith("@") ? basicId.trim() : `@${basicId.trim()}`)
        : undefined; // ← undefined にして“項目自体を保存しない”方がZodに優しい

    // 保存ペイロードを“あるものだけ”詰める
    const item: any = {
      id: crypto.randomUUID().replace(/-/g, "").slice(0, 20),
      aid,                              // 必須 string
      formUrl: form,                    // 必須 string
      formId,                           // 必須 string
      notify: notify ? 1 : 0,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt: Number(expiresAt || 0) || 0,
    };
    if (typeof title === "string") item.title = title;
    if (typeof desc === "string") item.desc = desc;
    if (normBasicId) item.basicId = normBasicId;

    await getLinksByIdContainer().items.upsert(item);

    console.info("[links:create] ok lid=%s aid=%s", item.id, aid.slice(0, 6) + "…");

    const origin = getPublicOrigin(req);
    return ok(req, { ok: true, link: `${origin}/open?lid=${item.id}`, lid: item.id }, 201);
  } catch (e: any) {
    console.error("❌ /api/links failed:", e);
    return fail(req, { ok: false, code: "LINKS_CREATE_FAILED" }, 500);
  }
}

