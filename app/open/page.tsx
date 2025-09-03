// import type { Metadata } from "next";
// import OpenFormClient from "./OpenFormClient";
// import { getLinksByIdContainer } from "@/lib/cosmos";

// function publicOrigin() {
//   return (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_ORIGIN || "").replace(/\/$/, "");
// }

// export const dynamic = "force-dynamic";

// export async function generateMetadata(
//   { searchParams }: { searchParams: { lid?: string } }
// ): Promise<Metadata> {
//   const lid = searchParams.lid ?? "";
//   let title = "Googleフォーム";
//   let description = "フォームに回答してください。";
//   if (lid) {
//     try {
//       const c = getLinksByIdContainer();
//       const { resource } = await c.item(lid, lid).read<any>();
//       if (resource?.title) title = resource.title;
//       if (resource?.desc) description = resource.desc;
//     } catch { /* noop */ }
//   }
//   const origin = publicOrigin();
//   const url = `${origin}/open?lid=${encodeURIComponent(lid)}`;
//   const ogImage = `${origin}/api/link-preview?title=${encodeURIComponent(title)}&desc=${encodeURIComponent(description)}`;
//   return {
//     title,
//     description,
//     openGraph: { title, description, url, images: [{ url: ogImage, width: 1200, height: 630 }] },
//     twitter: { card: "summary_large_image", title, description, images: [ogImage] },
//   };
// }

// export default function OpenPage() {
//   return <OpenFormClient />;
// }
// app/open/page.tsx
import OpenFormClient from "./OpenFormClient";

export default function OpenPage() {
  return <OpenFormClient />;
}

