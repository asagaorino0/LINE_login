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

/* ---- 1) LIFF の liff.state を通常クエリに復元（★replaceは1回だけ） ---- */
(function normalizeLiffStateOnce() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const state = url.searchParams.get("liff.state");
    if (state) {
      const raw = state.startsWith("?") ? state.slice(1) : state;
      const s = new URLSearchParams(raw);
      const next = new URL(url.origin + url.pathname);
      s.forEach((v, k) => next.searchParams.set(k, v));
      // ★ここは1回だけ
      window.location.replace(next.toString());
    }
  } catch { }
})();

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const [liffIdForButton, setLiffIdForButton] = useState<string | null>(null);
  const sentRef = useRef(false);

  /* ---- 戻ってきたときは即閉じる ---- */
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

  /* ---- 主要フロー ---- */
  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);
        const lid = qs.get("lid");
        const entryFromUrl = qs.get("entry");
        const liffFromUrl = qs.get("liff");////未使用


        // 後で消す！！
        // 🔍 スマホで確認できるように一時的にalertを出す
        alert(
          `🔍 LIFF デバッグ情報\n\n` +
          `lid: ${lid ?? "(null)"}\n` +
          `entry: ${entryFromUrl ?? "(null)"}\n` +
          `liff: ${liffFromUrl ?? "(null)"}\n\n` +
          `URL: ${location.href}`
        );
        if (!lid) throw new Error("NO_LID_IN_URL");

        const base = getBaseUrl() || location.origin;

        // 1) リンク情報
        const linkResp = await fetch(`${base}/api/links/${lid}`, {
          credentials: "include",
          cache: "no-store",
        });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        // 2) entry 決定
        const entry =
          entryFromUrl
            ? (entryFromUrl.startsWith("entry.") ? entryFromUrl : `entry.${entryFromUrl}`)
            : (link.entry ? (String(link.entry).startsWith("entry.") ? String(link.entry) : `entry.${link.entry}`) : null);
        if (!entry) throw new Error("ENTRY_ID_MISSING");

        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);

        // 3) LIFF 初期化
        const liffIdFromQuery = qs.get("liff") || qs.get("liffId") || undefined;
        const liffToUse = (liffIdFromQuery || link.liffId || process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID) as string | undefined;
        if (!liffToUse) throw new Error("LIFF_ID_MISSING");

        setLiffIdForButton(liffToUse);
        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF_INIT_FAILED");

        const mobile = isMobileLike();
        const inClient =
          typeof (window as any).liff?.isInClient === "function"
            ? (window as any).liff.isInClient()
            : (liffManager as any).isInClient?.() ?? false;

        if (mobile) {
          if (!inClient) {
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
          sessionStorage.removeItem(ONCE_KEY);
        } else {
          const isLoggedIn =
            (window as any).liff?.isLoggedIn?.() ?? (liffManager as any).isLoggedIn?.() ?? false;
          if (!isLoggedIn) {
            (window as any).liff?.login?.({ redirectUri: location.href });
            return;
          }
        }

        // 4) UID 取得
        const profile = await liffManager.getProfile();
        if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");
        const uid = profile.userId;

        // 5) フォームURL組み立て（保険のプレフィル）
        const viewBase = viewUrl.split("?")[0];
        const prefill = `${viewBase}?usp=pp_url&${entry}=${encodeURIComponent(uid)}`;

        // 6) トークン方式と競合させる（どちらか早い方）
        const issuePromise = (async () => {
          const res = await fetch(`${base}/api/token/issue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lid, uid }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok || !j?.ok || !j.redirectUrl) throw new Error(j?.error || "TOKEN_ISSUE_FAILED");
          return j.redirectUrl as string;
        })();

        const timeoutPromise = new Promise<string>((resolve) => {
          setTimeout(() => resolve(prefill), 1200);
        });

        const dest = await Promise.race([issuePromise, timeoutPromise]).catch(() => prefill);

        // ★ デバッグ：最終遷移URLを出力
        console.log("[OPEN] redirect to:", dest);

        // 7) 遷移（★ここで終了。↓の“重複ブロック”は削除）
        sessionStorage.setItem(FORM_REDIRECTED_KEY, "1");
        location.replace(dest.startsWith("http") ? dest : `${base}${dest}`);

      } catch (e: any) {
        console.error("[open] error:", e);
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  /* ---- LINEで開く（モバイル外部ブラウザ） ---- */
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

  if (typeof window !== "undefined" && sessionStorage.getItem(FORM_REDIRECTED_KEY) === "1") {
    return <div />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600 p-4">
      {showOpenInLine ? (
        <div className="text-center space-y-3">
          <div className="text-gray-700 font-medium">外部ブラウザで開かれています</div>
          <p className="text-xs text-gray-500">自動でLINEに切り替えられない環境です。「LINEで開く」を押してください。</p>
          <button onClick={openInLine} className="px-4 py-2 rounded bg-black text-white">LINEで開く</button>
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