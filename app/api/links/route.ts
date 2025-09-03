// app/api/links/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getLinksByIdContainer } from "@/lib/cosmos";

/* ---------- CORS ---------- */
function cors(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin, // "*" は cookie を返す時 NG
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  } as const;
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}
const ok = (req: NextRequest, body: any, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const fail = (req: NextRequest, body: any, status = 500) => NextResponse.json(body, { status, headers: cors(req) });

/* ---------- 入力 ---------- */
type Body = {
  form?: string;
  title?: string | null;
  desc?: string | null;
  notify?: number | boolean;  // 1/0 or true/false
  basicId?: string | null;    // ← どの公式LINE（ボット）か
  expiresAt?: number | 0;     // UNIX秒。0 or 未指定なら無期限
};

// e パターンを想定（必要なら /d/ の分岐も足せます）
// const FORM_ID_RE = /\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//;
// e の有無どちらでもキャプチャ
const FORM_ID_RE = /\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)\//;

function extractFormId(formUrl: string): string | null {
  try { formUrl = decodeURIComponent(formUrl); } catch { }
  const m = formUrl.match(FORM_ID_RE);
  return m ? m[1] : null;
}

// function extractFormId(formUrl: string): string | null {
//   const m = formUrl.match(FORM_ID_RE);
//   return m ? m[1] : null;
// }

/* ---------- 公開URLの推定（これを使う） ---------- */
function getPublicOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_ORIGIN;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const originHdr = h.get("origin");
  if (originHdr?.startsWith("http")) return originHdr;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

/* ---------- メイン ---------- */
export async function POST(req: NextRequest) {
  try {
    const { form, title, desc, notify, basicId, expiresAt } = (await req.json()) as Body;
    if (!form) return fail(req, { ok: false, code: "NO_FORM" }, 400);
    const formId = extractFormId(form);
    if (!formId) return fail(req, { ok: false, code: "BAD_FORM_URL" }, 400);
    // 管理者ログイン済み（/api/line-admin で uid クッキーが入っていること）
    const aid = (await cookies()).get("uid")?.value;
    if (!aid) return fail(req, { ok: false, code: "NO_ADMIN_ID" }, 401);
    // lid 生成＆保存
    const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const now = Math.floor(Date.now() / 1000); // ← 秒に統一
    await getLinksByIdContainer().items.upsert({
      id: lid,                 // partition key も lid
      aid,                     // 管理者 LINE UID
      basicId: basicId ?? null,
      formUrl: form,
      formId,
      title: title ?? null,
      desc: desc ?? null,
      notify: notify ? 1 : 0,
      createdAt: now,                         // 秒
      expiresAt: Number(expiresAt || 0) || 0 // 0なら無期限
    });
    const origin = getPublicOrigin(req);
    console.log("[/api/links] resolved origin:", origin);
    return ok(req, { ok: true, link: `${origin}/open?lid=${lid}`, lid }, 201);
  } catch (error: any) {
    const status = error?.status ?? 500;
    const code = error?.message || "LINKS_CREATE_FAILED";
    console.error("❌ /api/links failed:", { code, status, detail: String(error) });
    return fail(req, { ok: false, code }, status);
  }
}
