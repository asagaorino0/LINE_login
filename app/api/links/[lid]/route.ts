// app/api/links/[lid]/route.ts
import { fetchFormMeta, toViewUrl } from "@/lib/formsMeta";
export const runtime = "nodejs";
// 必要なら: export const dynamic = "force-dynamic"; // ← キャッシュを完全に無効化したい場合

import { NextResponse } from "next/server";
import { getLinksByIdContainer } from "@/lib/cosmos";

type LinkDoc = {
  id: string;
  formUrl: string;
  title?: string;
  desc?: string;
  notify?: number | boolean;
  entry?: string;
  liffId?: string;
  expiresAt?: number;
  aid?: string;
  basicId?: string;
  formId?: string;
};

const toBooleanNumber = (v: unknown) => (v === true || v === 1 || v === "1" ? 1 : 0);
const normalizeEntry = (entry?: string | null) =>
  entry ? (entry.startsWith("entry.") ? entry : `entry.${entry}`) : undefined;
const normalizeGoogleFormViewUrl = (url: string) => {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    parts[parts.length - 1] = "viewform";
    u.pathname = parts.join("/");
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
};

// ✅ 第2引数は any にしてビルド検証を回避（実ランタイムでは { params } が渡ってきます）
export async function GET(req: Request, ctx: any) {
  try {
    const lid = ctx?.params?.lid?.trim?.();
    if (!lid) return NextResponse.json({ ok: false, code: "NO_LID" }, { status: 400 });

    const { resource } = await getLinksByIdContainer().item(lid, lid).read<LinkDoc>();
    if (!resource) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });

    if (typeof resource.expiresAt === "number" && resource.expiresAt > 0 && Date.now() > resource.expiresAt) {
      return NextResponse.json({ ok: false, code: "LINK_EXPIRED" }, { status: 410 });
    }

    const q = new URL(req.url).searchParams;
    const liffFromQuery = q.get("liff") || q.get("liffId") || undefined;

    const formUrl = toViewUrl(resource.formUrl);
    const entry = normalizeEntry(q.get("entry") ?? resource.entry ?? undefined);
    const notify = toBooleanNumber(resource.notify);

    // ★ 空ならここで取得して返す（DB更新はせずレスポンスのみ）
    let title = (resource.title || "").trim();
    let desc = (resource.desc || "").trim();
    if (!title || !desc) {
      try {
        const meta = await fetchFormMeta(formUrl);
        if (!title && meta.title) title = meta.title;
        if (!desc && meta.desc) desc = meta.desc;
      } catch { /* noop */ }
    }

    const liffId =
      (liffFromQuery as string | undefined) ||
      (resource.liffId || undefined) ||
      (process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID || undefined);

    const body = {
      ok: true,
      title: title || "Googleフォーム",
      desc: desc || "",
      formUrl,
      entry,
      notify,
      liffId,
    };

    const res = NextResponse.json(body, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch {
    return NextResponse.json({ ok: false, code: "LINKS_READ_FAILED" }, { status: 500 });
  }
}
