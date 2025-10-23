"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

const ONCE_KEY = "redirectedToLiff";
const FORM_REDIRECTED_KEY = "redirectedToForm";

function isMobileLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(ua);
}

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const [pcOnlyNotice, setPcOnlyNotice] = useState(false);
  const [liffIdForButton, setLiffIdForButton] = useState<string | null>(null);
  const sentRef = useRef(false);

  // ---- フォームから戻ったら即閉じる（残留対策） ----
  useEffect(() => {
    const tryClose = () => {
      const flagged = sessionStorage.getItem(FORM_REDIRECTED_KEY) === "1";
      const fromForms = document.referrer.includes("docs.google.com/forms");
      if (!flagged && !fromForms) return;

      sessionStorage.removeItem(FORM_REDIRECTED_KEY);
      try { (window as any).liff?.closeWindow?.(); } catch { }
      try { window.close(); } catch { }
      // それでも残るブラウザ用の最終手段
      setTimeout(() => {
        try { location.replace("about:blank"); } catch { }
      }, 120);
    };

    // マウント時・BFCache復帰・可視化・フォーカスでチェック
    tryClose();
    const onPageShow = () => tryClose();
    const onVisible = () => { if (document.visibilityState === "visible") tryClose(); };
    const onFocus = () => tryClose();

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);
        const lid = qs.get("lid");
        if (!lid) throw new Error("NO_LID_IN_URL");

        // --- 1) リンク情報取得（await 必要：フォームURL/entry が必要だから） ---
        const linkResp = await fetch(`/api/links/${lid}`, { credentials: "include", cache: "no-store" });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        // entry は URL または link.entry からのみ（detect はしない）
        const entryFromUrl = qs.get("entry");
        const entry =
          entryFromUrl ? (entryFromUrl.startsWith("entry.") ? entryFromUrl : `entry.${entryFromUrl}`) :
            link.entry ? (String(link.entry).startsWith("entry.") ? String(link.entry) : `entry.${link.entry}`) :
              null;
        if (!entry) throw new Error("Entry ID がありません。リンクに &entry= を付けるか、リンク作成時に entry を設定してください。");

        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);

        // --- 2) LIFF ID 決定 & 初期化 ---
        const liffIdFromQuery = qs.get("liff") || qs.get("liffId") || undefined;
        const liffToUse = (liffIdFromQuery || link.liffId || process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID) as string | undefined;
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");

        setLiffIdForButton(liffToUse);
        const ok = await liffManager.init({ liffId: liffToUse }); // in-client 判定に必要なので await
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        // --- 3) モバイル/PC & in-client 分岐 ---
        const mobile = isMobileLike();
        const inClient =
          typeof (window as any).liff?.isInClient === "function"
            ? (window as any).liff.isInClient()
            : (liffManager as any).isInClient?.() ?? false;

        // PC は即メッセージ（自動遷移なし）
        if (!mobile) {
          setPcOnlyNotice(true);
          setErr(null);
          return;
        }

        // モバイル：LINE外なら一度だけユニバーサルリンクへ
        if (!inClient) {
          const already = sessionStorage.getItem(ONCE_KEY) === "1";
          if (!already) {
            sessionStorage.setItem(ONCE_KEY, "1");
            const universal = `https://liff.line.me/${encodeURIComponent(liffToUse)}${location.search || ""}`;
            location.replace(universal);
            return;
          } else {
            // // それでも in-client にならない場合
            // setShowOpenInLine(true);
            // return;
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
        }
        // in-client で戻ってきた
        sessionStorage.removeItem(ONCE_KEY);

        // --- 4) UID 取得（ここだけ await。これ以外は待たない） ---
        const profile = await liffManager.getProfile(); // in-client ならログイン促しは出ない
        if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");
        const uid = profile.userId;
        // --- 5) prefill を作って即遷移（最短経路） ---
        const base = viewUrl.split("?")[0];
        const prefill = `${base}?usp=pp_url&${entry}=${encodeURIComponent(uid)}`;
        sessionStorage.setItem(FORM_REDIRECTED_KEY, "1");
        // 通知 / ユーザー登録は投げっぱなしで OK（遷移はブロックしない）
        // // 4) プロフィール取得（in-clientなのでログイン画面は出ない）
        // const profile = await liffManager.getProfile();
        // if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");

        // await fetch("/api/line-users", {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   credentials: "include",
        //   body: JSON.stringify({
        //     lineUserId: profile.userId,
        //     displayName: profile.displayName,
        //     pictureUrl: profile.pictureUrl ?? null,
        //   }),
        // });

        // // 5) GoogleフォームURL & entry
        // const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);
        // const entryFromUrl = qs.get("entry");
        // let userEntry: string | null = null;
        // if (entryFromUrl) {
        //   userEntry = entryFromUrl.startsWith("entry.") ? entryFromUrl : `entry.${entryFromUrl}`;
        // } else if (link.entry) {
        //   userEntry = link.entry.startsWith("entry.") ? link.entry : `entry.${link.entry}`;
        // } else {
        //   const det = await GoogleFormsManager.detectEntryIds(viewUrl).catch(() => null);
        //   if (det?.success && det.userId) userEntry = det.userId.startsWith("entry.") ? det.userId : `entry.${det.userId}`;
        //   if (!userEntry) throw new Error("Entry ID が見つかりません。&entry= を付けてください。");
        // }
        // // 6) prefill
        // const prefill = `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(profile.userId)}`;

        // // 6) 通知（任意）
        // if (!sentRef.current && link.notify === 1) {
        //   sentRef.current = true;
        //   const payload = {
        //     userId: uid,
        //     type: "card" as const,
        //     formUrl: prefill,
        //     title: link.title || "Googleフォーム",
        //     desc: link.desc || "※こちらご対応頂くことで弊社からご連絡することが可能になります。必ずご回答ください。",
        //     bgcolor: link.bgcolor,
        //     lid,
        //   };
        //   try {
        //     let sent = false;
        //     if ("sendBeacon" in navigator) {
        //       const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        //       sent = navigator.sendBeacon("/api/line", blob);
        //     }
        //     if (!sent) {
        //       fetch("/api/line", {
        //         method: "POST",
        //         headers: { "Content-Type": "application/json" },
        //         body: JSON.stringify(payload),
        //         keepalive: true,
        //       }).catch(() => { });
        //     }
        //   } catch { }
        // }
        // ユーザー保存も fire-and-forget
        try {
          if (uid) {
            fetch("/api/line-users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                lineUserId: uid,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl ?? null,
              }),
              keepalive: true,
            }).catch(() => { });
          }
        } catch { }
        // ← ここで待たずにすぐ遷移
        location.replace(prefill);
      } catch (e: any) {
        console.error("[open] error:", e);
        if (!pcOnlyNotice) setErr(e?.message || String(e));
      }
    })();
  }, [pcOnlyNotice]);

  const openInLine = () => {
    const qs = location.search || "";
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

  // フォームへ飛ぶ直前・復帰直後は UI を出さない（残像対策）
  if (typeof window !== "undefined" && sessionStorage.getItem(FORM_REDIRECTED_KEY) === "1") {
    return <div />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600 p-4">
      {
        //   pcOnlyNotice ? (
        //   <div className="text-center space-y-3">
        //     <div className="text-gray-800 font-semibold">このページはパソコンでは実行できません</div>
        //     <p className="text-xs text-gray-500">
        //       お手数ですが、<span className="font-medium">スマホの LINE から本リンクを開いて</span>実行してください。
        //     </p>
        //     <div className="text-[11px] text-gray-400">（スマホで開くと自動でフォームに遷移します）</div>
        //   </div>
        // ) :
        showOpenInLine ? (
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