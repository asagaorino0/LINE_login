// app/api/links/[lid]/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getLinksByIdContainer } from "@/lib/cosmos";

export async function GET(_req: NextRequest, { params }: { params: { lid: string } }) {
  try {
    const lid = params.lid;
    const c = getLinksByIdContainer();
    const { resource } = await c.item(lid, lid).read<any>();
    if (!resource) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });

    const now = Math.floor(Date.now() / 1000);
    if (resource.disabled) return NextResponse.json({ ok: false, code: "DISABLED" }, { status: 403 });
    if (resource.expiresAt && resource.expiresAt > 0 && resource.expiresAt < now) {
      return NextResponse.json({ ok: false, code: "EXPIRED" }, { status: 410 });
    }

    return NextResponse.json({
      ok: true,
      aid: resource.aid,
      formUrl: resource.formUrl,
      title: resource.title ?? null,
      desc: resource.desc ?? null,
    });
  } catch (e: any) {
    console.error("/api/links/[lid] error:", e);
    return NextResponse.json({ ok: false, code: "ERROR", message: e?.message ?? "error" }, { status: 500 });
  }
}
