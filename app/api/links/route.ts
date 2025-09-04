//app/api/links/route.ts
// app/api/links/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ★ 受信ボディを型付きで整える（ここで “undefined” を潰す）
    const form = typeof body.form === "string" ? body.form : "";
    const title = typeof body.title === "string" ? body.title : ""; // ← 必須stringなら空文字に
    const desc = typeof body.desc === "string" ? body.desc : ""; // ← 同上
    const notify = body.notify ? 1 : 0; // number|boolean混在対策
    const aid = typeof body.aid === "string" ? body.aid : "";       // ← 必須string
    const basicIdRaw = typeof body.basicId === "string" ? body.basicId.trim() : "";

    // ★ ここで「何がどう来てるか」を必ずログ
    console.info("[/api/links] recv", {
      keys: Object.keys(body),
      formType: typeof body.form, hasForm: !!form,
      titleType: typeof body.title, hasTitle: title.length > 0,
      descType: typeof body.desc, hasDesc: desc.length > 0,
      notifyRaw: body.notify, notify,
      aidType: typeof body.aid, hasAid: !!aid, aidMasked: aid ? aid.slice(0, 6) + "…" : null,
      basicIdType: typeof body.basicId, basicIdRaw,
    });

    // ここからバリデーション（常に code を返す）
    if (!form) return fail(req, { ok: false, code: "NO_FORM" }, 400);
    const formId = extractFormId(form);
    if (!formId) return fail(req, { ok: false, code: "BAD_FORM_URL" }, 400);
    if (!aid) return fail(req, { ok: false, code: "NO_ADMIN_ID" }, 401);

    // notify=1 のときだけ basicId 必須／notify=0 のときは不要
    let normBasicId: string | null = null;
    if (notify) {
      if (!basicIdRaw) {
        return fail(req, { ok: false, code: "NO_BASIC_ID" }, 400);
      }
      normBasicId = basicIdRaw.startsWith("@") ? basicIdRaw : `@${basicIdRaw}`;
    }

    const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const now = Math.floor(Date.now() / 1000);

    // 保存するデータ（optionalは“あるときだけ”入れる）
    const item: any = {
      id: lid,
      aid,
      formUrl: form,
      formId,
      notify,
      createdAt: now,
      expiresAt: Number(body.expiresAt || 0) || 0,
      title, // 空文字でもstringなので Zod "string required" で落ちにくい
      desc,
    };
    if (normBasicId) item.basicId = normBasicId;

    await getLinksByIdContainer().items.upsert(item);

    console.info("[links:create] ok lid=%s aid=%s", lid, aid.slice(0, 6) + "…");

    const origin = getPublicOrigin(req);
    return ok(req, { ok: true, link: `${origin}/open?lid=${lid}`, lid }, 201);
  } catch (e: any) {
    if (e?.errors && Array.isArray(e.errors)) {
      const fields = e.errors.map((er: any) => ({
        path: Array.isArray(er.path) ? er.path.join(".") : String(er.path),
        expected: er.expected,
        received: er.received,
        message: er.message,
      }));
      console.error("❌ /api/links validation error", fields);
      return NextResponse.json(
        { ok: false, code: "INVALID_USER_DATA", fields },
        { status: 400 }
      );
    }
    console.error("❌ /api/links failed:", e);
    return NextResponse.json({ ok: false, code: "LINKS_CREATE_FAILED" }, { status: 500 });
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