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


  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);
        const lid = qs.get("lid");
        if (!lid) throw new Error("NO_LID_IN_URL");

        // 1) /api/links
        const linkResp = await fetch(`/api/links/${lid}`, { credentials: "include" });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        // 2) LIFF ID
        const liffIdFromQuery = qs.get("liff") || qs.get("liffId") || undefined;
        const liffToUse = (liffIdFromQuery || link.liffId || process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID) as string | undefined;
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");

        setLiffIdForButton(liffToUse);

        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        // 3) in-client 判定
        const inClient = typeof (window as any).liff?.isInClient === "function"
          ? (window as any).liff.isInClient()
          : (liffManager as any).isInClient?.() ?? false;

        // 3.5) in-client でない → ユニバーサルリンクへ自動遷移（ループ防止あり）
        if (!inClient) {
          const already = sessionStorage.getItem(ONCE_KEY) === "1";
          if (!already) {
            sessionStorage.setItem(ONCE_KEY, "1");
            // いまのクエリをそのまま引き継ぐ
            const universal = `https://liff.line.me/${encodeURIComponent(liffToUse)}${location.search || ""}`;
            location.replace(universal);
            return;
          } else {
            // それでも in-client にならない＝LINE外で開いている可能性 → ボタン表示
            setShowOpenInLine(true);
            return;
          }
        }
        // in-client で再入場できたのでフラグをクリア
        sessionStorage.removeItem(ONCE_KEY);

        // 4) プロフィール取得（in-clientなのでログイン画面は出ない）
        const profile = await liffManager.getProfile();
        if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");

        await fetch("/api/line-users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            lineUserId: profile.userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl ?? null,
          }),
        });

        // 5) GoogleフォームURL & entry
        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);
        const entryFromUrl = qs.get("entry");
        let userEntry: string | null = null;
        if (entryFromUrl) {
          userEntry = entryFromUrl.startsWith("entry.") ? entryFromUrl : `entry.${entryFromUrl}`;
        } else if (link.entry) {
          userEntry = link.entry.startsWith("entry.") ? link.entry : `entry.${link.entry}`;
        } else {
          const det = await GoogleFormsManager.detectEntryIds(viewUrl).catch(() => null);
          if (det?.success && det.userId) userEntry = det.userId.startsWith("entry.") ? det.userId : `entry.${det.userId}`;
          if (!userEntry) throw new Error("Entry ID が見つかりません。&entry= を付けてください。");
        }

        // 6) prefill
        const prefill = `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(profile.userId)}`;

        // 7) 通知（任意）
        if (!sentRef.current && link.notify === 1) {
          sentRef.current = true;
          const payload = {
            userId: profile.userId,
            type: "card" as const,
            formUrl: prefill,
            title: link.title || "Googleフォーム",
            desc: link.desc || "※こちらご対応頂くことで弊社からご連絡することが可能になります。必ずご回答ください。",
            bgcolor: link.bgcolor,
            lid,
          };
          try {
            let sent = false;
            if ("sendBeacon" in navigator) {
              const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
              sent = navigator.sendBeacon("/api/line", blob);
            }
            if (!sent) {
              await fetch("/api/line", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                keepalive: true,
              });
            }
          } catch { /* ignore */ }
        }

        // 8) 遷移
        setTimeout(() => location.replace(prefill), 150);
      } catch (e: any) {
        console.error("[open] error:", e);
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
          <p className="text-xs text-gray-500">自動でLINEに切り替えられない環境です。「LINEで開く」を押してください。</p>
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
