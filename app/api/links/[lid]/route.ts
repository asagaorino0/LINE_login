// // app/api/links/[lid]/route.ts
// // export const runtime = "nodejs";
// // import { NextRequest, NextResponse } from "next/server";
// // import { getLinksByIdContainer } from "@/lib/cosmos";

// // /** 同一オリジンなのでCORSは最小でOK */
// // const ok = (b: any, s = 200) => NextResponse.json(b, { status: s });
// // const fail = (b: any, s = 500) => NextResponse.json(b, { status: s });

// // export async function GET(
// //   _req: NextRequest,
// //   { params }: { params: { lid: string } }
// // ) {
// //   try {
// //     const lid = params.lid;
// //     if (!lid) return fail({ ok: false, code: "NO_LID" }, 400);
// //     const c = getLinksByIdContainer();
// //     const { resource } = await c.item(lid, lid).read<any>();
// //     if (!resource) return fail({ ok: false, code: "NOT_FOUND" }, 404);
// //     const now = Math.floor(Date.now() / 1000);
// //     if (resource.disabled) return fail({ ok: false, code: "LID_DISABLED" }, 403);
// //     if (resource.expiresAt && resource.expiresAt > 0 && resource.expiresAt < now) {
// //       return fail({ ok: false, code: "LID_EXPIRED" }, 410);
// //     }
// //     // 機微は返さない
// //     const { aid, basicId = null, formUrl, title = null, desc = null, notify = 0, expiresAt = 0 } = resource;
// //     return ok({ ok: true, aid, basicId, formUrl, title, desc, notify, expiresAt });
// //   } catch (e: any) {
// //     console.error("GET /api/links/[lid] failed:", e);
// //     return fail({ ok: false, code: "LINK_FETCH_FAILED" }, 500);
// //   }
// // }
// // app/api/links/[lid]/route.ts
// import { NextResponse } from "next/server";
// import { getLinksByIdContainer } from "@/lib/cosmos";

// /* ---- CORS ---- */
// function cors(req: Request) {
//   const origin = req.headers.get("origin") ?? "*";
//   return {
//     "Access-Control-Allow-Origin": origin,
//     "Access-Control-Allow-Credentials": "true",
//     Vary: "Origin",
//     "Access-Control-Allow-Methods": "GET,OPTIONS",
//     "Access-Control-Allow-Headers": "content-type",
//   } as const;
// }
// export async function OPTIONS(req: Request) {
//   return new NextResponse(null, { status: 204, headers: cors(req) });
// }
// const ok = (req: Request, body: any, status = 200) =>
//   NextResponse.json(body, { status, headers: cors(req) });
// const fail = (req: Request, body: any, status = 500) =>
//   NextResponse.json(body, { status, headers: cors(req) });

// /* ---- GET /api/links/:lid ---- */
// export async function GET(req: Request, ctx: any) {
//   try {
//     const lid: string | undefined = ctx?.params?.lid;
//     if (!lid) return fail(req, { ok: false, code: "NO_LID" }, 400);

//     const { resource } = await getLinksByIdContainer()
//       .item(lid, lid)
//       .read<{
//         aid: string;
//         basicId?: string | null;
//         formUrl: string;
//         formId?: string | null;
//         title?: string | null;
//         desc?: string | null;
//         notify?: number;
//         expiresAt?: number;
//         disabled?: boolean;
//       }>();

//     if (!resource) return fail(req, { ok: false, code: "LID_NOT_FOUND" }, 404);

//     const now = Math.floor(Date.now() / 1000);
//     if (resource.disabled) return fail(req, { ok: false, code: "LID_DISABLED" }, 403);
//     if (resource.expiresAt && resource.expiresAt > 0 && resource.expiresAt < now) {
//       return fail(req, { ok: false, code: "LID_EXPIRED" }, 410);
//     }

//     return ok(req, {
//       ok: true,
//       lid,
//       aid: resource.aid,
//       basicId: resource.basicId ?? null,
//       formUrl: resource.formUrl,
//       formId: resource.formId ?? null,
//       title: resource.title ?? null,
//       desc: resource.desc ?? null,
//       notify: Number(resource.notify ?? 0),
//     });
//   } catch (err: any) {
//     const status = err?.status ?? 500;
//     return fail(req, { ok: false, code: err?.message || "LINKS_READ_FAILED" }, status);
//   }
// }

// app/api/links/[lid]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getLinksByIdContainer } from "@/lib/cosmos";

export async function GET(_req: Request, context: any) {
  try {
    const lid = (context?.params?.lid ?? "").trim();
    if (!lid) {
      return NextResponse.json({ ok: false, code: "NO_LID" }, { status: 400 });
    }

    const { resource } = await getLinksByIdContainer().item(lid, lid).read<any>();
    if (!resource) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }

    const { aid, basicId, formUrl, formId, title, desc, notify, expiresAt, entry } = resource;
    return NextResponse.json(
      { ok: true, aid, basicId, formUrl, formId, title, desc, notify, expiresAt, entry },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, code: "LINKS_READ_FAILED" }, { status: 500 });
  }
}




