"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const sentRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);
        const lid = qs.get("lid");
        if (!lid) throw new Error("NO_LID_IN_URL");

        // 1) リンク情報
        const linkResp = await fetch(`/api/links/${lid}`, { credentials: "include" });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        // 2) LIFF 初期化（LIFF URL から来ているので liffId は暗黙に決定される）
        const liffIdFromQuery = qs.get("liff") || qs.get("liffId") || undefined;
        const liffToUse = (liffIdFromQuery || link.liffId || process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID) as string | undefined;
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");
        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        // 3) in-client の判定
        const inClient = typeof (window as any).liff?.isInClient === "function"
          ? (window as any).liff.isInClient()
          : (liffManager as any).isInClient?.() ?? false;

        // 4) 認証フロー
        if (!inClient && !liffManager.isLoggedIn()) {
          // 外部ブラウザ → ログインが必要（or LINEで開いてもらう）
          // a) 自動ログインさせたい場合（必要ならON）
          // const back = new URL(location.href);
          // back.searchParams.set("liffId", liffToUse);
          // await liffManager.login({ redirectUri: back.toString() });
          // return;

          // b) 画面上に「LINEで開く」ボタンを出す（おすすめ）
          setShowOpenInLine(true);
          return;
        }

        // 5) プロフィール取得（in-client ならログイン画面は出ない）
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

        // 6) GoogleフォームURL 正規化 & entry 決定
        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);
        const entryFromUrl = qs.get("entry");
        let userEntry: string | null = null;
        if (entryFromUrl) {
          userEntry = entryFromUrl.startsWith("entry.") ? entryFromUrl : `entry.${entryFromUrl}`;
        } else if (link.entry) {
          userEntry = link.entry.startsWith("entry.") ? link.entry : `entry.${link.entry}`;
        } else {
          const det = await GoogleFormsManager.detectEntryIds(viewUrl).catch(() => null);
          if (det?.success && det.userId) userEntry = det.userId;
          if (!userEntry) throw new Error("Entry ID が見つかりません。&entry= を付けてください。");
        }

        // 7) prefill 作成
        const prefill = `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(profile.userId)}`;

        // 8) 通知（任意）
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

        // 9) 遷移
        setTimeout(() => location.replace(prefill), 150);
      } catch (e: any) {
        console.error("[open] error:", e);
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  // 外部ブラウザ用：LINEで開くボタン
  const openInLine = () => {
    // LIFF URL へ自分自身を開き直す（external: false でLINE内へ）
    const base = typeof window !== "undefined" ? window.location.origin : "https://line-login-self.vercel.app";
    const url = new URL("/open", base);
    const qs = new URLSearchParams(location.search);
    // liffId は付けなくてOK（LIFF URLにするなら下記のように）
    // ここでは「このページ自体が LIFF アプリとして配信されている」想定
    url.search = qs.toString();
    (window as any).liff?.openWindow?.({ url: url.toString(), external: false });
  };

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600 p-4">
      {showOpenInLine ? (
        <div className="text-center space-y-3">
          <div className="text-gray-700 font-medium">外部ブラウザで開かれています</div>
          <p className="text-xs text-gray-500">LINEアプリ内で開くとログインなしで進めます。</p>
          <button
            onClick={openInLine}
            className="px-4 py-2 rounded bg-black text-white"
          >
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
