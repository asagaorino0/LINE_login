// app/line-settings/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LineSettingsClient from "./client"; // ← UI はクライアントへ分離

export default async function Page() {
  const store = await cookies();                // Next 15 は Promise。await 必須
  const isAdmin = store.get("admin")?.value === "1";
  if (!isAdmin) redirect("/sign-in?redirect=/line-settings");
  return <LineSettingsClient />;                // クライアントのUIを描画
}
