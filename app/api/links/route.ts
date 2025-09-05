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
  console.info("HIT /api/links v=2025-09-05T12:34+09:00", req.nextUrl.toString());
  if (req.nextUrl.searchParams.get("ping") === "1") {
    return NextResponse.json({ ok: true, code: "PING_OK", route: "/api/links" }, { status: 200 });
  }

  try {
    const body = await req.json();

    // ★ 受信直後に型＆値をログ（早期 return でも必ず出る）
    const form = typeof body.form === "string" ? body.form : "";
    const title = typeof body.title === "string" ? body.title : "";
    const desc = typeof body.desc === "string" ? body.desc : "";
    const notify = body.notify ? 1 : 0;
    const aid = typeof body.aid === "string" ? body.aid : "";
    const basicIdIn = typeof body.basicId === "string" ? body.basicId.trim() : "";

    console.info("[/api/links] recv", {
      keys: Object.keys(body),
      types: {
        form: typeof body.form, title: typeof body.title, desc: typeof body.desc,
        notify: typeof body.notify, aid: typeof body.aid, basicId: typeof body.basicId
      },
      values: {
        hasForm: !!form, hasTitle: !!title, hasDesc: !!desc, notify,
        hasAid: !!aid, aidMasked: aid ? aid.slice(0, 6) + "…" : null, basicIdIn
      }
    });
    console.info("[/api/links] recv keys/types", {
      keys: Object.keys(body),
      form: typeof body.form,
      title: typeof body.title,
      desc: typeof body.desc,
      notify: body.notify,
      aid: typeof body.aid,
      basicId: typeof body.basicId,
    });

    // ★ クエリ ?debug=1 ならそのまま中身を返す（本番でも即確認できる）
    const debug = req.nextUrl.searchParams.get("debug") === "1";
    if (debug) {
      return NextResponse.json({
        ok: false, code: "DEBUG_ECHO",
        received: { form, title, desc, notify, aid, basicIdIn }
      }, { status: 200 });
    }
    // --- 早期バリデーション（必ず code を付ける＋ログも出す）---
    if (!form) {
      console.warn("[/api/links] NO_FORM");
      return NextResponse.json({ ok: false, code: "NO_FORM" }, { status: 400 });
    }
    const formId = extractFormId(form);
    if (!formId) {
      console.warn("[/api/links] BAD_FORM_URL", { form });
      return NextResponse.json({ ok: false, code: "BAD_FORM_URL" }, { status: 400 });
    }
    if (!aid) {
      console.warn("[/api/links] NO_ADMIN_ID");
      return NextResponse.json({ ok: false, code: "NO_ADMIN_ID" }, { status: 401 });
    }

    // notify=1 のときだけ basicId 必須
    let normBasicId: string | null = null;
    if (notify) {
      if (!basicIdIn) {
        console.warn("[/api/links] NO_BASIC_ID (notify=1)");
        return NextResponse.json({ ok: false, code: "NO_BASIC_ID" }, { status: 400 });
      }
      normBasicId = basicIdIn.startsWith("@") ? basicIdIn : `@${basicIdIn}`;
    }

    // --- ここから保存 ---
    const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const now = Math.floor(Date.now() / 1000);

    const item: any = {
      id: lid,
      aid,
      formUrl: form,
      formId,
      notify,
      createdAt: now,
      expiresAt: Number(body.expiresAt || 0) || 0,
      // title/desc が必須stringなら空文字でもOK、厳しければ条件付きで入れる
      title,
      desc,
    };
    if (normBasicId) item.basicId = normBasicId;

    await getLinksByIdContainer().items.upsert(item);

    console.info("[links:create] ok", { lid, aidMasked: aid.slice(0, 6) + "…" });

    const origin = getPublicOrigin(req);
    return NextResponse.json({ ok: true, link: `${origin}/open?lid=${lid}`, lid }, { status: 201 });

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