// app/line-settings/page.tsx
import LineSettingsClient from "./client"; // ← UI はクライアントへ分離

export default async function Page() {
  return <LineSettingsClient />;                // クライアントのUIを描画
}
