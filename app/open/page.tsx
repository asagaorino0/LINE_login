export const runtime = "nodejs";   // Node ランタイムで Cosmos に触れる
export const revalidate = 0;       // 常に動的

import OpenFormClient from "./OpenFormClient";
import { getLinksByIdContainer } from "@/lib/cosmos";
import { fetchFormMeta } from "@/lib/formsMeta";

// OGP をサーバーで生成（JS不要）
export async function generateMetadata({ searchParams }: { searchParams: any }) {
  const sp = await searchParams;
  const lid = (sp.lid || "").trim();
  let title = sp.title || "Googleフォーム";
  let desc = sp.desc || "";

  // lid があれば Cosmos からタイトル/説明を取得
  if (lid) {
    try {
      const { resource } = await getLinksByIdContainer().item(lid, lid).read<any>();
      if (resource) {
        title = (resource.title || "").trim();
        desc = (resource.desc || "").trim();

        // title/desc が空ならGoogleフォームから取得
        if (!title || !desc) {
          try {
            const meta = await fetchFormMeta(resource.formUrl);
            if (!title && meta.title) title = meta.title;
            if (!desc && meta.desc) desc = meta.desc;
          } catch { /* noop */ }
        }

        // まだ空ならデフォルト値
        if (!title) title = "Googleフォーム";
      }
    } catch { /* noop */ }
  }

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      type: "website",
      url: `/open${lid ? `?lid=${lid}` : ""}`,
    },
    twitter: {
      card: "summary",
      title,
      description: desc,
    },
  };
}

export default function Page() {
  // 実際の遷移/送信はクライアントにお任せ
  return <OpenFormClient />;
}
