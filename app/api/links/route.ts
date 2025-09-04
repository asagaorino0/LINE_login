// app/api/links/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
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
const ok = (req: NextRequest, body: any, status = 200) =>
  NextResponse.json(body, { status });
const fail = (req: NextRequest, body: any, status = 500) =>
  NextResponse.json(body, { status });

type Body = {
  form?: string;
  title?: string | null;
  desc?: string | null;
  notify?: number | boolean;
  basicId?: string | null;
  expiresAt?: number | 0;
};

export async function POST(req: NextRequest) {
  try {
    const { form, title, desc, notify, basicId, expiresAt } =
      (await req.json()) as Body;

    if (!form) return fail(req, { ok: false, code: "NO_FORM" }, 400);
    const formId = extractFormId(form);
    if (!formId) return fail(req, { ok: false, code: "BAD_FORM_URL" }, 400);

    const aid = (await cookies()).get("uid")?.value;
    if (!aid) return fail(req, { ok: false, code: "NO_ADMIN_ID" }, 401);

    const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const now = Math.floor(Date.now() / 1000);

    await getLinksByIdContainer().items.upsert({
      id: lid,
      aid,
      basicId: basicId ?? null,
      formUrl: form,
      formId,
      title: title ?? null,
      desc: desc ?? null,
      notify: notify ? 1 : 0,
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
