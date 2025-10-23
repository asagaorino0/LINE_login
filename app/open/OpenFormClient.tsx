"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

const ONCE_KEY = "redirectedToLiff";

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const sentRef = useRef(false);
  const [liffIdForButton, setLiffIdForButton] = useState<string | null>(null);

  // ★ 追加：通知送信を関数化（必ず待つ・認証つき・遷移前に猶予）
  async function sendNotifyCard(payload: any) {
    try {
      // 1) まず sendBeacon を試す
      let beaconed = false;
      if ("sendBeacon" in navigator) {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        beaconed = navigator.sendBeacon("/api/line", blob);
      }

      // 2) 失敗/未対応なら fetch + keepalive + credentials
      if (!beaconed) {
        await fetch("/api/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
          credentials: "include", // ★ サーバがセッション/クッキーを見る構成に対応
        });
      }

      // 3) iOS/Safari/一部 WebView 対策で少し待つ（500–800ms 推奨）
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) {
      // 通知失敗でもフォーム遷移は続行したいので握りつぶす
      console.warn("[notify] failed:", e);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);
        const lid = qs.get("lid");
        if (!lid) throw new Error("NO_LID_IN_URL");

        // 1) /api/links 取得
        const linkResp = await fetch(`/api/links/${lid}`, { credentials: "include" });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        // 2) LIFF 初期化
        const liffIdFromQuery = qs.get("liff") || qs.get("liffId") || undefined;
        const liffToUse = (liffIdFromQuery || link.liffId || process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID) as string | undefined;
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");
        setLiffIdForButton(liffToUse);

        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        const liffObj = (window as any).liff;
        const inClient = typeof liffObj?.isInClient === "function" ? liffObj.isInClient() : false;

        // ★ ここが変更点：inClient でなくても続行する
        // 未ログインならログイン（PC外部ブラウザでもOK）
        if (!liffObj.isLoggedIn()) {
          liffObj.login({ redirectUri: window.location.href });
          return; // ここで一旦離脱、ログイン後に同じURLで戻って来る
        }

        // 3) ユーザーID取得（外部ブラウザでは ID Token の sub が確実）
        let userId: string | null = null;
        try {
          const decoded = liffObj.getDecodedIDToken?.();
          userId = decoded?.sub || null;
        } catch { }
        if (!userId) {
          const profile = await liffObj.getProfile();
          userId = profile?.userId || null;
        }
        if (!userId) throw new Error("LINEユーザーIDが取得できませんでした。");

        // 4) ユーザー保存（任意）
        await fetch("/api/line-users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            lineUserId: userId,
            displayName: liffObj.getDecodedIDToken?.()?.name ?? undefined,
            pictureUrl: liffObj.getDecodedIDToken?.()?.picture ?? null,
          }),
        }).catch(() => { /* 失敗しても続行 */ });

        // 5) GoogleフォームURL & entry 決定
        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);
        const entryFromUrl = qs.get("entry");
        let userEntry: string | null = null;
        if (entryFromUrl) {
          userEntry = entryFromUrl.startsWith("entry.") ? entryFromUrl : `entry.${entryFromUrl}`;
        } else if (link.entry) {
          userEntry = link.entry.startsWith("entry.") ? link.entry : `entry.${link.entry}`;
        } else {
          // 自動検出は不安定なら省略可
          const det = await GoogleFormsManager.detectEntryIds(viewUrl).catch(() => null);
          if (det?.success && det.userId)
            userEntry = det.userId.startsWith("entry.") ? det.userId : `entry.${det.userId}`;
        }
        if (!userEntry) throw new Error("Entry ID が見つかりません。&entry= を付けてください。");

        // 6) プリフィル作成
        const prefill = `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(userId)}`;

        // 7) 通知（必要なときだけ、少し待ってから）
        if (!sentRef.current && link.notify === 1) {
          sentRef.current = true;
          const payload = {
            userId,
            type: "card" as const,
            formUrl: prefill,
            title: link.title || "Googleフォーム",
            desc: link.desc || "※こちらご対応頂くことで弊社からご連絡することが可能になります。必ずご回答ください。",
            bgcolor: link.bgcolor,
            lid,
          };
          await sendNotifyCard(payload).catch(() => { });
        }

        // 8) 遷移（PC/外部ブラウザでもOK）
        location.replace(prefill);
      } catch (e: any) {
        console.error("[open] error:", e);
        // モバイルでLINE外ブラウザのときだけ「LINEで開く」を出す
        const ua = navigator.userAgent.toLowerCase();
        const isMobile = /iphone|ipad|ipod|android/.test(ua);
        if (isMobile) setShowOpenInLine(true);
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  // 保険：手動で「LINEで開く」
  const openInLine = () => {
    const qs = location.search || "";
    // ★ クエリ優先＋無ければ state の liffIdForButton を使う
    const fromQuery = new URLSearchParams(qs).get("liff") || new URLSearchParams(qs).get("liffId");
    const id = fromQuery || liffIdForButton;
    if (!id) {
      alert("LIFF ID が特定できません（URLかリンク設定をご確認ください）");
      return;
    }
    const universal = `https://liff.line.me/${encodeURIComponent(id)}${qs}`;
    if ((window as any).liff?.openWindow) {
      (window as any).liff.openWindow({ url: universal, external: false });
    } else {
      location.href = universal;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600 p-4">
      {showOpenInLine ? (
        <div className="text-center space-y-3">
          <div className="text-gray-700 font-medium">外部ブラウザで開かれています</div>
          <p className="text-xs text-gray-500">
            自動でLINEに切り替えられない環境です。「LINEで開く」を押してください。
          </p>
          <button onClick={openInLine} className="px-4 py-2 rounded bg-black text-white">
            LINEで開く
          </button>
        </div>
      ) : err ? (
        <div className="text-center max-w-md">
          <div className="text-red-600 mb-2">エラーが発生しました</div>
          <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded break-words">{err}</div>
          <div className="mt-4 text-xs text-gray-400">ページを再読み込みするか、管理者にお問い合わせください。</div>
        </div>
      ) : (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4"></div>
          <div>フォームへ遷移中…</div>
        </div>
      )}
    </div>
  );
}
