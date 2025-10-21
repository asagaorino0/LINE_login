// app/api/links/[lid]/route.ts
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
    if (!lid) {
      return NextResponse.json({ ok: false, code: "NO_LID" }, { status: 400 });
    }

    const { resource } = await getLinksByIdContainer().item(lid, lid).read<LinkDoc>();
    if (!resource) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }

    // 有効期限チェック（任意）
    if (typeof resource.expiresAt === "number" && resource.expiresAt > 0 && Date.now() > resource.expiresAt) {
      return NextResponse.json({ ok: false, code: "LINK_EXPIRED" }, { status: 410 });
    }

    const q = new URL(req.url).searchParams;
    const liffFromQuery = q.get("liff") || q.get("liffId") || undefined;

    const formUrl = normalizeGoogleFormViewUrl(resource.formUrl);
    const entry = normalizeEntry(q.get("entry") ?? resource.entry ?? undefined);
    const notify = toBooleanNumber(resource.notify);

    // LIFF_ID の決定順：クエリ > DB > 環境変数（保険）
    const liffId =
      (liffFromQuery as string | undefined) ||
      (resource.liffId || undefined) ||
      (process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID || undefined);

    const body = {
      ok: true,
      title: resource.title || "Googleフォーム",
      desc: resource.desc || "",
      formUrl,
      entry,     // "entry.XXXX" に正規化済
      notify,    // 0/1
      liffId,    // 変動OK（無ければ undefined）
      // 必要なら以下を開放
      // aid: resource.aid ?? undefined,
      // basicId: resource.basicId ?? undefined,
      // formId: resource.formId ?? undefined,
      // expiresAt: resource.expiresAt ?? undefined,
    };

    const res = NextResponse.json(body, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch {
    return NextResponse.json({ ok: false, code: "LINKS_READ_FAILED" }, { status: 500 });
  }
}
