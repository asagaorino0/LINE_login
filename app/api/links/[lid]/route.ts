// app/api/links/[lid]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getLinksByIdContainer } from "@/lib/cosmos";

// ---- 型（Cosmosの実体に合わせて適宜拡張OK）----
type LinkDoc = {
  id: string;           // = lid（パーティションキー）
  formUrl: string;
  title?: string;
  desc?: string;
  notify?: number | boolean;
  entry?: string;       // "entry.XXXX" でも "XXXX" でも可（受け取ったら正規化）
  liffId?: string;      // 可変を想定
  expiresAt?: number;   // epoch ms（任意）
  // 任意で保持している補助情報（必要なら出す）
  aid?: string;
  basicId?: string;
  formId?: string;
};

// ---- ユーティリティ ----
const toBooleanNumber = (v: unknown) => (v === true || v === 1 || v === "1" ? 1 : 0);
const normalizeEntry = (entry?: string | null) => {
  if (!entry) return undefined;
  return entry.startsWith("entry.") ? entry : `entry.${entry}`;
};
/** GoogleフォームURLを /viewform に正規化（余計なクエリ除去） */
const normalizeGoogleFormViewUrl = (url: string) => {
  try {
    const u = new URL(url);
    // /viewform で終わる形に寄せる（/formResponse等が来ても丸める）
    const paths = u.pathname.split("/");
    const last = paths[paths.length - 1];
    if (last !== "viewform") {
      paths[paths.length - 1] = "viewform";
      u.pathname = paths.join("/");
    }
    // 既存のクエリは基本不要（usp などはクライアント側で付与）
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
};

export async function GET(req: NextRequest, ctx: { params: { lid?: string } }) {
  try {
    const lid = (ctx?.params?.lid ?? "").trim();
    if (!lid) {
      return NextResponse.json({ ok: false, code: "NO_LID" }, { status: 400 });
    }

    // Cosmos から取得
    const { resource } = await getLinksByIdContainer().item(lid, lid).read<LinkDoc>();
    if (!resource) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }

    // 有効期限チェック（任意）
    if (typeof resource.expiresAt === "number" && resource.expiresAt > 0) {
      if (Date.now() > resource.expiresAt) {
        return NextResponse.json({ ok: false, code: "LINK_EXPIRED" }, { status: 410 });
      }
    }

    // クエリからの上書き（LIFF_ID は変動前提：?liff= / ?liffId= が来たら優先）
    const q = req.nextUrl.searchParams;
    const liffFromQuery = q.get("liff") || q.get("liffId") || undefined;

    // 正規化
    const formUrl = normalizeGoogleFormViewUrl(resource.formUrl);
    const entry = normalizeEntry(q.get("entry") ?? resource.entry ?? undefined);
    const notify = toBooleanNumber(resource.notify);

    // LIFF_ID の決定順：クエリ > DB > 環境変数（保険）
    const liffId =
      (liffFromQuery as string | undefined) ||
      (resource.liffId || undefined) ||
      (process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID || undefined);

    // 最小＆安全なレスポンス（機微情報は出さない）
    const body = {
      ok: true,
      title: resource.title || "Googleフォーム",
      desc: resource.desc || "",
      formUrl,
      entry,       // 例: "entry.1969076360"（未設定なら undefined）
      notify,      // 0 or 1
      liffId,      // ★ここが変動してもOK（未設定なら undefined）
      // 必要なら下記を活かす（UIで使うなら）
      // aid: resource.aid ?? undefined,
      // basicId: resource.basicId ?? undefined,
      // formId: resource.formId ?? undefined,
      // expiresAt: resource.expiresAt ?? undefined,
    };

    const res = NextResponse.json(body, { status: 200 });
    // キャッシュ禁止（LIFF_IDの変動に即追従）
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, code: "LINKS_READ_FAILED" }, { status: 500 });
  }
}
