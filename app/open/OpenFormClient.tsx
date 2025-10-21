"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

const ONCE_KEY = "redirectedToLiff";

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const sentRef = useRef(false);

  // 通知送信関数（確実に待つ）
  async function sendNotifyCard(payload: any) {
    try {
      // 1) fetch を本線に。（beacon はフォールバック）
      let ok = false;
      try {
        const r = await fetch("/api/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
          credentials: "include",
        });
        ok = r.ok;
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          console.warn("[notify] fetch failed:", r.status, text);
        }
      } catch (e) {
        console.warn("[notify] fetch threw:", e);
      }

      // 2) fetch がダメなら beacon に退避
      if (!ok && "sendBeacon" in navigator) {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        const sent = navigator.sendBeacon("/api/line", blob);
        console.log("[notify] beacon =", sent);
        ok = sent;
      }

      // 3) iOS/Safari 対策：遷移直前に待機
      await new Promise((r) => setTimeout(r, ok ? 400 : 900));
    } catch (e) {
      console.warn("[notify] failed:", e);
    }
  }


  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);
        const lid = qs.get("lid");
        if (!lid) throw new Error("NO_LID_IN_URL");

        // 1) /api/links でリンク情報取得
        const linkResp = await fetch(`/api/links/${lid}`, { credentials: "include" });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        // 2) LIFF ID
        const liffIdFromQuery = qs.get("liff") || qs.get("liffId") || undefined;
        const liffToUse = (liffIdFromQuery || link.liffId || process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID) as
          | string
          | undefined;
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");

        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        // 3) in-client 判定
        const inClient =
          typeof (window as any).liff?.isInClient === "function"
            ? (window as any).liff.isInClient()
            : (liffManager as any).isInClient?.() ?? false;

        // in-client でなければ「LINEで開く」ボタンを出す（ログイン不要）
        // ★追加: in-client かつ未ログインならサイレントSSO
        if (inClient && !(window as any).liff?.isLoggedIn?.()) {
          await (window as any).liff.login({ redirectUri: location.href, prompt: "none" });
          return; // リダイレクト後に再実行されて通知まで到達
        }

        // 4) in-client ならログイン不要で UID 取得できる
        const profile = await liffManager.getProfile().catch(() => null);

        const uid = profile?.userId || ""; // UID取れないときは空欄
        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);

        // entry
        const entryFromUrl = qs.get("entry");
        const userEntry = entryFromUrl
          ? entryFromUrl.startsWith("entry.")
            ? entryFromUrl
            : `entry.${entryFromUrl}`
          : link.entry?.startsWith("entry.")
            ? link.entry
            : `entry.${link.entry}`;

        // prefill
        const prefill =
          uid && userEntry
            ? `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(uid)}`
            : viewUrl;

        // 通知（uidがあるときのみ送信）
        if (!sentRef.current && Number(link.notify) === 1 && uid) {
          sentRef.current = true;
          const payload = {
            userId: uid,
            type: "card" as const,
            formUrl: prefill,
            title: link.title || "Googleフォーム",
            desc:
              link.desc ||
              "※こちらご対応頂くことで弊社からご連絡することが可能になります。必ずご回答ください。",
            bgcolor: link.bgcolor,
            lid,
          };
          await sendNotifyCard(payload);
        }

        // フォームへ遷移
        setTimeout(() => location.replace(prefill), 150);
      } catch (e: any) {
        console.error("[open] error:", e);
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  const openInLine = () => {
    const qs = location.search || "";
    const liffId = new URLSearchParams(qs).get("liff") || new URLSearchParams(qs).get("liffId");
    if (!liffId) return alert("LIFF ID 不明です");
    const universal = `https://liff.line.me/${encodeURIComponent(liffId)}${qs}`;
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
          <p className="text-xs text-gray-500">LINEアプリで開くとユーザー情報を自動反映できます。</p>
          <button onClick={openInLine} className="px-4 py-2 rounded bg-black text-white">
            LINEで開く
          </button>
        </div>
      ) : err ? (
        <div className="text-center max-w-md">
          <div className="text-red-600 mb-2">エラーが発生しました</div>
          <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded break-words">{err}</div>
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
