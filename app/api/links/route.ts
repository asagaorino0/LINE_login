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
    const body = await req.json();
    const form = String(body.form ?? "");
    const notify = !!body.notify;
    const aid = typeof body.aid === "string" ? body.aid : null;
    const rawBasicId = typeof body.basicId === "string" ? body.basicId.trim() : "";

    // ★ aid のチェックログ
    if (aid) {
      console.info("[/api/links] aid 受信 OK:", aid);
    } else {
      console.error("[/api/links] aid が undefined/null です ❌ body.aid=", body.aid);
    }

    console.info("[/api/links] recv", {
      hasForm: !!form,
      notify,
      aidType: typeof aid,
      hasAid: !!aid,
      aid,
      rawBasicId,
    });

    if (!form) return fail(req, { ok: false, code: "NO_FORM" }, 400);
    const formId = extractFormId(form);
    if (!formId) return fail(req, { ok: false, code: "BAD_FORM_URL" }, 400);

    if (!aid) return fail(req, { ok: false, code: "NO_ADMIN_ID" }, 401);

    // basicId の扱いを notify に応じて分岐
    let normBasicId: string | null = null;
    if (notify) {
      // 通知ON → basicId 必須
      if (typeof body.basicId !== "string" || !body.basicId.trim()) {
        return fail(req, { ok: false, code: "NO_BASIC_ID" }, 400);
      }
      normBasicId = body.basicId.trim().startsWith("@")
        ? body.basicId.trim()
        : `@${body.basicId.trim()}`;
    } else {
      // 通知OFF → basicId は不要
      normBasicId = null;
    }

    const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const now = Math.floor(Date.now() / 1000);

    await getLinksByIdContainer().items.upsert({
      id: lid,
      aid,
      basicId: normBasicId,   // 通知OFFなら null
      formUrl: form,
      formId: body.formId,
      title: body.title ?? null,
      desc: body.desc ?? null,
      notify: notify ? 1 : 0,
      createdAt: now,
      expiresAt: Number(body.expiresAt || 0) || 0,
    });

    const origin = getPublicOrigin(req);
    return ok(req, { ok: true, link: `${origin}/open?lid=${lid}`, lid }, 201);
  } catch (e: any) {
    console.error("❌ /api/links failed:", e);
    return fail(req, { ok: false, code: "LINKS_CREATE_FAILED" }, 500);
  }
}


// export async function POST(req: NextRequest) {
//   try {
//     const body = (await req.json()) as Body;
//     const { form, title, desc, notify, basicId, expiresAt, aid } = body;

//     if (!form) return fail(req, { ok: false, code: "NO_FORM" }, 400);
//     const formId = extractFormId(form);
//     if (!formId) return fail(req, { ok: false, code: "BAD_FORM_URL" }, 400);

//     if (!aid) return fail(req, { ok: false, code: "NO_ADMIN_ID" }, 401);

//     // basicId の扱いを notify に応じて分岐
//     let normBasicId: string | null = null;
//     if (notify) {
//       // 通知ON → basicId 必須
//       if (typeof basicId !== "string" || !basicId.trim()) {
//         return fail(req, { ok: false, code: "NO_BASIC_ID" }, 400);
//       }
//       normBasicId = basicId.trim().startsWith("@")
//         ? basicId.trim()
//         : `@${basicId.trim()}`;
//     } else {
//       // 通知OFF → basicId は不要
//       normBasicId = null;
//     }

//     const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
//     const now = Math.floor(Date.now() / 1000);

//     await getLinksByIdContainer().items.upsert({
//       id: lid,
//       aid,
//       basicId: normBasicId,   // 通知OFFなら null
//       formUrl: form,
//       formId,
//       title: title ?? null,
//       desc: desc ?? null,
//       notify: notify ? 1 : 0,
//       createdAt: now,
//       expiresAt: Number(expiresAt || 0) || 0,
//     });

//     const origin = getPublicOrigin(req);
//     return ok(req, { ok: true, link: `${origin}/open?lid=${lid}`, lid }, 201);
//   } catch (e: any) {
//     console.error("❌ /api/links failed:", e);
//     return fail(req, { ok: false, code: "LINKS_CREATE_FAILED" }, 500);
//   }
// }