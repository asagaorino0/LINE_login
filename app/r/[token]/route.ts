// app/r/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/token";

/** lid からリンク情報を取得 */
async function fetchLink(lid: string) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const r = await fetch(`${base}/api/links/${encodeURIComponent(lid)}`, { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.ok ? j : null; // { ok: true, formUrl, entry, ... }
}

/** /forms/... を必ず /viewform に正規化 */
function toViewUrl(u: string) {
  try {
    const url = new URL(u);
    if (!/\/viewform($|\?)/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/edit.*$/, "/viewform");
      if (!/\/viewform$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, "") + "/viewform";
    }
    return url.toString();
  } catch {
    return u;
  }
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = params.token;
    if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });

    const secret = process.env.TOKEN_SECRET;
    if (!secret) return NextResponse.json({ ok: false, error: "NO_JWT_SECRET" }, { status: 500 });

    // 1) トークン検証 → uid / lid
    const { uid, lid } = verifyToken(token, secret);

    // 2) lid から formUrl / entry を取得
    const link = await fetchLink(lid);
    if (!link) return NextResponse.json({ ok: false, error: "LINK_NOT_FOUND" }, { status: 404 });

    const formView = toViewUrl(link.formUrl);
    const rawEntry = String(link.entry || "").trim();
    if (!rawEntry) return NextResponse.json({ ok: false, error: "ENTRY_NOT_SET" }, { status: 400 });

    // 3) prefill URL 構築（必ず entry.XXXX の形）
    const entryKey = rawEntry.startsWith("entry.") ? rawEntry : `entry.${rawEntry}`;
    const url = new URL(formView);
    url.searchParams.set("usp", "pp_url");
    url.searchParams.set(entryKey, uid);

    // 4) 302 リダイレクト
    return NextResponse.redirect(url.toString(), 302);
  } catch (e: any) {
    console.error("[r/[token]] error:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
