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
        const lid = qs.get("lid"); // ★ 必須：リンクID
        if (!lid) throw new Error("NO_LID_IN_URL");

        console.log("[open] lid =", lid);

        // 1) lid からリンク情報を取得（formUrl, liffId など）
        const linkResp = await fetch(`/api/links/${lid}`, { credentials: "include" });
        const linkData = await linkResp.json();
        if (!linkResp.ok || !linkData?.ok) {
          const errorCode = linkData?.code || "LINK_NOT_FOUND";
          const errorMap: Record<string, string> = {
            NO_LID: "リンクIDが指定されていません",
            NOT_FOUND: "指定されたリンクが見つかりません",
            LID_DISABLED: "このリンクは無効化されています",
            LID_EXPIRED: "このリンクは期限切れです",
            LINK_NOT_FOUND: "リンクが見つかりません",
            LID_NOT_FOUND: "リンクが見つかりません",
          };
          throw new Error(errorMap[errorCode] || `リンクエラー: ${errorCode}`);
        }

        // 2) リンクから LIFF ID を取得（クエリ指定で上書き可）
        let liffIdToUse: string | undefined = linkData.liffId || undefined;
        const fromQuery = qs.get("liff") || qs.get("liffId"); // 例: &liff=2008088055-gKXl6W1p
        if (fromQuery) liffIdToUse = fromQuery || undefined;

        console.log(
          "[open] liffId (link) =",
          linkData.liffId,
          " / (query) =",
          fromQuery,
          " / (use) =",
          liffIdToUse
        );

        if (!liffIdToUse) {
          throw new Error("LIFF ID が未設定です。リンク設定またはURLクエリ（&liff=...）を確認してください。");
        }

        // --- ここが重要：リンクの liffId で init → login 判定 ---
        //        const ok = await liffManager.init({ liffIdOverride: liffIdToUse });
        const ok = await liffManager.init({ liffId: liffIdToUse }); // ← 修正: liffIdOverride ではない
        console.log("[open] init() ok =", ok, "resolved =", liffManager.getLiffId());
        if (!ok) {
          throw new Error("LIFF初期化に失敗しました。liffId が不正か、LIFFアプリが無効/削除されています。");
        }

        if (!liffManager.isLoggedIn()) {
          // 戻り先は現在URL
          //    liffManager.login(location.href);
          await liffManager.login({ redirectUri: location.href }); // ← 修正: 引数オブジェクト
          return; // いったん終了（復帰後に再実行される）
        }

        // ログイン後に IDトークンを取得して API へ（401対策）
        const idToken = await liffManager.getIdToken(); // ← 追加メソッド
        if (!idToken) throw new Error("LINE IDトークン取得失敗");

        // ※ サーバ側が Authorization を見ていない場合は不要。あなたの実装に合わせて。
        const res = await fetch("/api/liff-settings", {
          headers: { Authorization: `Bearer ${idToken}` },
          credentials: "include",
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`liff-settings NG: ${res.status} ${t}`);
        }
        const data = await res.json();
        console.log("[open] /api/liff-settings OK:", data);

        const profile = await liffManager.getProfile();
        if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");
        console.log("[open] profile OK:", profile.userId);

        // 3) フォームURL正規化
        const link = linkData;
        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);

        // 4) UID を入れる entry の決定（URL>サーバー保存>自動検出）
        const entryFromUrl = qs.get("entry");
        let userEntry: string | null = null;

        if (entryFromUrl) {
          userEntry = entryFromUrl.startsWith("entry.") ? entryFromUrl : `entry.${entryFromUrl}`;
          console.log("[open] 🎯 Using manual entry ID from URL:", userEntry);
        } else if (link.entry) {
          userEntry = link.entry.startsWith("entry.") ? link.entry : `entry.${link.entry}`;
          console.log("[open] 🎯 Using manual entry ID from server:", userEntry);
        } else {
          try {
            console.log("[open] 🔍 Detecting entry ID for:", viewUrl);
            const det = await GoogleFormsManager.detectEntryIds(viewUrl);
            console.log("[open] Detection result:", det);
            if (det?.success && det.userId) {
              userEntry = det.userId;
              console.log("[open] ✅ Using auto-detected entry ID:", userEntry);
            } else {
              throw new Error("Entry ID detection failed");
            }
          } catch (e) {
            console.warn("[open] ❌ Entry ID detection error:", e);
            throw new Error("このフォームでは自動UID連携に対応していません。手動でentry IDを指定してください。");
          }
        }

        if (!userEntry) throw new Error("Entry IDが取得できませんでした。");

        // 5) prefill URL を生成（?usp=pp_url&entry.xxx=<userId>）
        const prefill = `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(
          profile.userId
        )}`;
        console.log("[open] prefill =", prefill);

        // 6) LINE 送信用の通知（必要に応じてカード送信など）
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

        // 7) 少し待ってからフォームへ遷移
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
          <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded break-words">{err}</div>
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
