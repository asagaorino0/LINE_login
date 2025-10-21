// app/api/links/[lid]/route.ts
export const runtime = "nodejs";

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

// ✅ 第2引数は Record<string, string> にする
export async function GET(req: Request, { params }: { params: Record<string, string> }) {
  try {
    const lid = params?.lid?.trim();
    if (!lid) {
      return NextResponse.json({ ok: false, code: "NO_LID" }, { status: 400 });
    }

    const { resource } = await getLinksByIdContainer().item(lid, lid).read<LinkDoc>();
    if (!resource) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }

    // 期限切れ
    if (typeof resource.expiresAt === "number" && resource.expiresAt > 0 && Date.now() > resource.expiresAt) {
      return NextResponse.json({ ok: false, code: "LINK_EXPIRED" }, { status: 410 });
    }

    const q = new URL(req.url).searchParams;
    const liffFromQuery = q.get("liff") || q.get("liffId") || undefined;

    const formUrl = normalizeGoogleFormViewUrl(resource.formUrl);
    const entry = normalizeEntry(q.get("entry") ?? resource.entry ?? undefined);
    const notify = toBooleanNumber(resource.notify);

    const liffId =
      (liffFromQuery as string | undefined) ||
      (resource.liffId || undefined) ||
      (process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID || undefined);

    const body = {
      ok: true,
      title: resource.title || "Googleフォーム",
      desc: resource.desc || "",
      formUrl,
      entry,
      notify, // 0/1
      liffId, // 変動OK
    };

    const res = NextResponse.json(body, { status: 200 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch {
    return NextResponse.json({ ok: false, code: "LINKS_READ_FAILED" }, { status: 500 });
  }
}
