// app/api/links/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getLinksByIdContainer } from "@/lib/cosmos";

function cors(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  } as const;
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}
const ok = (req: NextRequest, body: any, status = 200) =>
  NextResponse.json(body, { status, headers: cors(req) });
const fail = (req: NextRequest, body: any, status = 500) =>
  NextResponse.json(body, { status, headers: cors(req) });

type Body = {
  form?: string;            // Googleフォームの viewform URL
  title?: string | null;    // 任意
  desc?: string | null;     // 任意
  expiresAt?: number | 0;   // 任意（UNIX秒。0 or 未指定なら無期限）
  adminId?: string;         // 任意（allowlist用の明示指定）
};

const FORM_ID_RE = /\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//;

function extractFormId(formUrl: string): string | null {
  const m = formUrl.match(FORM_ID_RE);
  return m ? m[1] : null;
}

// cookie(uid) → allowlist(adminId) の順で解決
async function resolveAdminId(req: NextRequest, adminId?: string): Promise<string> {
  const jar = await cookies();
  const uid = jar.get("uid")?.value;
  if (uid) return uid;

  const allow = (process.env.LINE_ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminId && allow.length && allow.includes(adminId)) return adminId;

  const e = new Error("NO_USER_ID"); (e as any).status = 400; throw e;
}

export async function POST(req: NextRequest) {
  try {
    const { form, title, desc, expiresAt, adminId } = (await req.json()) as Body;

    if (!form) return fail(req, { ok: false, code: "NO_FORM" }, 400);
    const formId = extractFormId(form);
    if (!formId) return fail(req, { ok: false, code: "BAD_FORM_URL" }, 400);

    const aid = await resolveAdminId(req, adminId);

    const lid = crypto.randomBytes(16).toString("hex").slice(0, 20);
    const now = Math.floor(Date.now() / 1000);

    const doc = {
      id: lid,           // partition key も lid
      aid,               // 管理者の LINE UID
      formUrl: form,
      formId,
      title: title ?? null,
      desc: desc ?? null,
      createdAt: now,
      expiresAt: Number(expiresAt || 0) || 0,
      disabled: false,
    };

    const c = getLinksByIdContainer();
    await c.items.create(doc);

    const origin = getPublicOrigin(req);
    const link = `${origin}/open?lid=${lid}`;
    console.log("[/api/links] resolved origin:", origin);

    return ok(req, { ok: true, link, lid }, 201);
  } catch (error: any) {
    const status = error?.status ?? 500;
    const code = error?.message || "LINKS_CREATE_FAILED";
    console.error("❌ /api/links failed:", { code, status, detail: String(error) });
    return fail(req, { ok: false, code }, status);
  }
}
// 追加: 公開URLを推定
function getPublicOrigin(req: NextRequest): string {
  // 環境変数で強制指定できるようにもしておく
  const env = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_ORIGIN;
  if (env) return env.replace(/\/$/, "");

  const h = req.headers;
  const originHdr = h.get("origin"); // ブラウザからの同一オリジン fetch なら入ってくる
  if (originHdr?.startsWith("http")) return originHdr;

  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}
