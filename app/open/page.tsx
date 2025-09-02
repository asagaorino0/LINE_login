// app/open/page.tsx  ← ※先頭に 'use client' を書かない
import type { Metadata } from "next";
import OpenFormClient from "./OpenFormClient";
import { getLinksByIdContainer } from "@/lib/cosmos";

function publicOrigin() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(
  { searchParams }: { searchParams: { lid?: string } }
): Promise<Metadata> {
  const lid = searchParams.lid ?? "";
  let title = "Googleフォーム";
  let description = "フォームに回答してください。";

  if (lid) {
    try {
      const c = getLinksByIdContainer();
      const { resource } = await c.item(lid, lid).read<any>();
      if (resource?.title) title = resource.title;
      if (resource?.desc) description = resource.desc;
    } catch { }
  }

  const origin = publicOrigin();
  const url = `${origin}/open?lid=${encodeURIComponent(lid)}`;
  const ogImage = `${origin}/api/link-preview?title=${encodeURIComponent(title)}&desc=${encodeURIComponent(description)}`;

  return {
    title,
    description,
    openGraph: { title, description, url, images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default function Page() {
  // ここはサーバーコンポーネント。クライアント処理は子の OpenFormClient に任せる
  return <OpenFormClient />;
}
