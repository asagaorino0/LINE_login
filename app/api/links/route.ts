// app/api/links/route.ts など POST 側（あなたの POST 実装箇所）
import { fetchFormMeta, toViewUrl } from "@/lib/formsMeta";
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
  bgcolor?: string | null;
  basicId?: string | null;
  expiresAt?: number | 0;
  entry?: string; // 手入力entry IDを追加
  liffId?: string; // LIFF IDを追加
  lineBasicId?: string | null;
  lineDisplayName?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const { form, title, desc, notify, bgcolor, basicId, expiresAt, entry, liffId, lineBasicId, lineDisplayName } = (await req.json()) as Body;

    if (!form) return fail(req, { ok: false, code: "NO_FORM" }, 400);
    const formId = extractFormId(form);
    if (!formId) return fail(req, { ok: false, code: "BAD_FORM_URL" }, 400);

    const cookieStore = await cookies();
    let aid = cookieStore.get("uid")?.value ?? null;

    if (notify) {
      if (!aid) return fail(req, { ok: false, code: "NO_ADMIN_ID" }, 401);
    } else {
      if (!aid) aid = "anonymous";
    }

    // ★ タイトル/説明の自動取得（未指定のときだけ）
    let finalTitle = (title ?? "").trim();
    let finalDesc = (desc ?? "").trim();
    if (!finalTitle || !finalDesc) {
      try {
        const meta = await fetchFormMeta(form);
        if (!finalTitle && meta.title) finalTitle = meta.title;
        if (!finalDesc && meta.desc) finalDesc = meta.desc;
      } catch { /* 失敗しても続行 */ }
    }

    const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const now = Math.floor(Date.now() / 1000);

    await getLinksByIdContainer().items.upsert({
      id: lid,
      aid,
      basicId: typeof basicId === "string" && basicId.trim()
        ? (basicId.trim().startsWith("@") ? basicId.trim() : `@${basicId.trim()}`)
        : null,
      formUrl: form,
      formId,
      title: finalTitle || null,
      desc: finalDesc || null,
      bgcolor: bgcolor ?? null,
      notify: notify ? 1 : 0,
      entry: entry ?? null,
      liffId: liffId ?? null,
      lineBasicId: typeof lineBasicId === "string" && lineBasicId.trim()
        ? (lineBasicId.trim().startsWith("@") ? lineBasicId.trim() : `@${lineBasicId.trim()}`)
        : null,
      lineDisplayName: lineDisplayName?.trim() || null,
      createdAt: now,
      expiresAt: Number(expiresAt || 0) || 0,
    });

    const origin = getPublicOrigin(req);
    return ok(req, { ok: true, link: `${origin}/open?lid=${lid}`, lid }, 201);
  } catch (e: any) {
    console.error("❌ /api/links failed:", e);
    return fail(req, { ok: false, code: "LINKS_CREATE_FAILED" }, 500);
  }
}
