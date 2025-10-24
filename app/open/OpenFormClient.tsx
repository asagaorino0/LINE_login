"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";
import { getBaseUrl } from "@/lib/getBaseUrl";

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
  const [liffIdForButton, setLiffIdForButton] = useState<string | null>(null);
  const sentRef = useRef(false);

  /* ---------------- 残留ビュー対策：戻ってきたら即閉じる ---------------- */
  useEffect(() => {
    const tryClose = () => {
      const flagged = sessionStorage.getItem(FORM_REDIRECTED_KEY) === "1";
      const fromForms = document.referrer.includes("docs.google.com/forms");
      if (!flagged && !fromForms) return;

      sessionStorage.removeItem(FORM_REDIRECTED_KEY);
      try { (window as any).liff?.closeWindow?.(); } catch { }
      try { window.close(); } catch { }
      setTimeout(() => {
        try { location.replace("about:blank"); } catch { }
      }, 120);
    };

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

  /* ---------------- 主要フロー ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);
        const lid = qs.get("lid");
        if (!lid) throw new Error("NO_LID_IN_URL");
        const base = getBaseUrl();

        // 1) リンク情報（await 必須：formUrl / entry が必要）
        // const linkResp = await fetch(`/api/links/${lid}`, { credentials: "include", cache: "no-store" });
        const linkResp = await fetch(`${base}/api/links/${lid}`, {
          credentials: "include",
          cache: "no-store",
        });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        // 2) entry は URL かリンク作成時の値のみ（detect は行わない）
        const entryFromUrl = qs.get("entry");
        const entry =
          entryFromUrl ? (entryFromUrl.startsWith("entry.") ? entryFromUrl : `entry.${entryFromUrl}`) :
            link.entry ? (String(link.entry).startsWith("entry.") ? String(link.entry) : `entry.${link.entry}`) :
              null;
        if (!entry) throw new Error("Entry ID がありません。リンクに &entry= を付けるか、リンク作成時に entry を設定してください。");

        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);

        // 3) LIFF 初期化
        const liffIdFromQuery = qs.get("liff") || qs.get("liffId") || undefined;
        const liffToUse = (liffIdFromQuery || link.liffId || process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID) as string | undefined;
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");

        setLiffIdForButton(liffToUse);
        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        const mobile = isMobileLike();
        const inClient =
          typeof (window as any).liff?.isInClient === "function"
            ? (window as any).liff.isInClient()
            : (liffManager as any).isInClient?.() ?? false;

        // 4) 端末別分岐
        if (mobile) {
          // モバイル：LINE 外なら一度だけユニバーサルリンク
          if (!inClient) {
            // const already = sessionStorage.getItem(ONCE_KEY) === "1";
            // if (!already) {
            //   sessionStorage.setItem(ONCE_KEY, "1");
            //   const universal = `https://liff.line.me/${encodeURIComponent(liffToUse)}${location.search || ""}`;
            //   location.replace(universal);
            //   return;
            // } else {
            const already = sessionStorage.getItem(ONCE_KEY) === "1";
            if (!already) {
              sessionStorage.setItem(ONCE_KEY, "1");
              const universal = `https://liff.line.me/${encodeURIComponent(liffToUse)}${location.search || ""}`;
              location.replace(universal);
              return;
            } else {
              setShowOpenInLine(true);
              return;
            }
          }
          // in-client で戻ってきた
          sessionStorage.removeItem(ONCE_KEY);
        } else {
          // PC：ユニバーサルリンクはしない。PC はログインを許可
          // すでにログイン済みならスキップ。未ログインなら LINE Login を使って同 URL に戻す。
          const isLoggedIn = (window as any).liff?.isLoggedIn?.() ?? (liffManager as any).isLoggedIn?.() ?? false;
          if (!isLoggedIn) {
            (window as any).liff?.login?.({ redirectUri: location.href });
            return; // ここでブラウザ遷移する
          }
        }
        // 5) UID 取得（ここだけ await、他は待たない）
        const profile = await liffManager.getProfile(); // in-client or PC-login 後なので prompt は出ない想定
        if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");
        const uid = profile.userId;
        // 6) prefill を作って即遷移（最短経路）
        // const base = viewUrl.split("?")[0];
        // const prefill = `${base}?usp=pp_url&${entry}=${encodeURIComponent(uid)}`;
        // // 8) 直ちにフォームへ
        // sessionStorage.setItem(FORM_REDIRECTED_KEY, "1");
        // location.replace(prefill);
        // 1) サーバで発行（短期トークン）
        // const issue = await fetch('/api/token/issue', {
        const issue = await fetch(`${base}/api/token/issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lid, uid }),
        });
        const j = await issue.json();
        if (!issue.ok || !j?.ok) throw new Error(j?.error || 'TOKEN_ISSUE_FAILED');

        // 2) サーバ側 302 経由でフォームへ（UIDはURLに出ない）
        sessionStorage.setItem(FORM_REDIRECTED_KEY, '1');
        const redirect = /^https?:\/\//i.test(j.redirectUrl)
          ? j.redirectUrl
          : `${base}${j.redirectUrl}`;
        location.replace(redirect);
      } catch (e: any) {
        console.error("[open] error:", e);
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  /* ---------------- 「LINEで開く」ボタン（モバイル外部ブラウザ用） ---------------- */
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

  /* ---------------- 残像抑制：フォーム遷移直前/直後は UI 非表示 ---------------- */
  if (typeof window !== "undefined" && sessionStorage.getItem(FORM_REDIRECTED_KEY) === "1") {
    return <div />;
  }

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