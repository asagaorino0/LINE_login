// app/open/OpenFormClient.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const sentRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);
        const lid = qs.get("lid");                      // ★ これが命
        if (!lid) throw new Error("NO_LID_IN_URL");

        console.log("[open] lid =", lid);

        // 必ず /open 画面上で LIFF 初期化
        await liffManager.init();
        if (!liffManager.isLoggedIn()) {
          await liffManager.login();
          return;
        }
        const profile = await liffManager.getProfile();
        if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");

        // lid からリンク情報を取得（aid/basicId, formUrl, title/desc）
        const r = await fetch(`/api/links/${lid}`, { credentials: "include" });
        const link = await r.json();
        if (!r.ok || !link?.ok) {
          const errorCode = link?.code || "LINK_NOT_FOUND";
          const errorMap: Record<string, string> = {
            NO_LID: "リンクIDが指定されていません",
            NOT_FOUND: "指定されたリンクが見つかりません",
            LID_DISABLED: "このリンクは無効化されています",
            LID_EXPIRED: "このリンクは期限切れです",
            LINK_NOT_FOUND: "リンクが見つかりません"
          };
          throw new Error(errorMap[errorCode] || `リンクエラー: ${errorCode}`);
        }
        // フォームURL正規化＆prefill生成（必要なら検出）
        // const viewUrl = (GoogleFormsManager as any).normalizeFormUrl
        //   ? (GoogleFormsManager as any).normalizeFormUrl(link.formUrl)
        //   : link.formUrl;
        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);
        let userEntry = "entry.1587760013";
        try {
          console.log("[open] Detecting entry IDs for:", viewUrl);
          const det = await GoogleFormsManager.detectEntryIds(viewUrl);
          console.log("[open] Detection result:", det);
          //   if (det?.success && det.userId) userEntry = det.userId;
          // } catch { /* noop */ }
          if (det?.success && det.userId) {
            userEntry = det.userId;
            console.log("[open] Using detected entry ID:", userEntry);
          } else {
            console.warn("[open] Entry ID detection failed, using default:", userEntry);
          }
        } catch (e) {
          console.warn("[open] Entry ID detection error:", e);
        }
        const prefill =
          `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(profile.userId)}`;

        // ── ここが肝：payload は lid だけ ─────────────────────────
        if (!sentRef.current) {
          sentRef.current = true;
          const payload = {
            userId: profile.userId,
            type: "card" as const,
            formUrl: prefill,
            title: link.title || "Googleフォーム",
            desc: link.desc || "フォームに回答してください。",
            bgcolor: link.bgcolor,
            lid, // これで adminKey が一意に解決される
          };
          console.log("[open] payload to /api/line 色=", payload.bgcolor, link);
          try {
            let sent = false;
            if ("sendBeacon" in navigator) {
              const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
              sent = navigator.sendBeacon("/api/line", blob);
            }
            if (!sent) {
              const rr = await fetch("/api/line", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                keepalive: true,
              });
              console.log("[open] fetch /api/line status =", rr.status);
            }
          } catch (e) {
            console.warn("[open] send to /api/line failed:", e);
          }
        }

        // 少し待ってからフォームへ遷移
        setTimeout(() => location.replace(prefill), 150);
      } catch (e: any) {
        console.error("[open] error:", e);
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600 p-4">
      {err ? (
        <div className="text-center max-w-md">
          <div className="text-red-600 mb-2">エラーが発生しました</div>
          <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded break-words">
            {err}
          </div>
          <div className="mt-4 text-xs text-gray-400">
            ページを再読み込みするか、管理者にお問い合わせください。
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div>フォームへ遷移中…</div>
        </div>
      )}
    </div>
  );
}
