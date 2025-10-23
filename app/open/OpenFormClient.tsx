"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

const ONCE_KEY = "redirectedToLiff";
const FORM_REDIRECTED_KEY = "redirectedToForm";

const CLOSE_RETRY_MS = 400;     // リトライ間隔
const CLOSE_RETRY_MAX = 25;     // 最大リトライ回数 (約10秒)

function isMobileLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iOS/Android/一部のモバイル UA を判定
  return /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(ua);
}

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const [pcOnlyNotice, setPcOnlyNotice] = useState(false); // ★ 追加：PC 向け案内
  const sentRef = useRef(false);
  const [liffIdForButton, setLiffIdForButton] = useState<string | null>(null);

  // async function sendNotifyCard(payload: any) {
  //   try {
  //     let beaconed = false;
  //     if ("sendBeacon" in navigator) {
  //       const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  //       beaconed = navigator.sendBeacon("/api/line", blob);
  //     }
  //     if (!beaconed) {
  //       await fetch("/api/line", {
  //         method: "POST",
  //         headers: { "Content-Type": "application/json" },
  //         body: JSON.stringify(payload),
  //         keepalive: true,
  //         credentials: "include",
  //       });
  //     }
  //     await new Promise((r) => setTimeout(r, 600));
  //   } catch (e) {
  //     console.warn("[notify] failed:", e);
  //   }
  // }

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
        const inClient =
          typeof (window as any).liff?.isInClient === "function"
            ? (window as any).liff.isInClient()
            : (liffManager as any).isInClient?.() ?? false;
        // 3.5) in-client でない場合の分岐を端末別に変更
        if (!inClient) {
          const mobile = isMobileLike();
          const already = sessionStorage.getItem(ONCE_KEY) === "1";
          if (mobile) {
            // ★ スマホ：従来どおりユニバーサルリンクへ一度だけ自動遷移
            if (!already) {
              sessionStorage.setItem(ONCE_KEY, "1");
              const universal = `https://liff.line.me/${encodeURIComponent(liffToUse)}${location.search || ""}`;
              location.replace(universal);
              return;
            } else {
              // ループ防止後は「LINEで開く」ボタンを出す（従来の保険）
              setShowOpenInLine(true);
              return;
            }
          } else {
            // ★ PC：遷移しない。案内のみ表示
            setPcOnlyNotice(true);
            setErr(null); // エラー枠は出さない
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
        sessionStorage.setItem(FORM_REDIRECTED_KEY, "1"); // ★ 追加
        setTimeout(() => location.replace(prefill), 150);
      } catch (e: any) {
        console.error("[open] error:", e);
        // PC 専用案内を優先している場合は err を出さない
        if (!pcOnlyNotice) setErr(e?.message || String(e));
      }
    })();
  }, [pcOnlyNotice]);

  // 保険：手動で「LINEで開く」
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
  useEffect(() => {
    let timer: number | undefined;
    let tries = 0;
    let stopping = false;

    const ensureLiffReady = async () => {
      try {
        // すでに初期化済みなら何もしない。未初期化でも例外なくスルー
        if (!(window as any).liff?.getContext) {
          // 画面で保持している liffId を使って再初期化を試行
          const qs = new URLSearchParams(location.search);
          const id =
            qs.get("liff") ||
            qs.get("liffId") ||
            // state のボタン用IDがあればそれも
            (typeof liffIdForButton === "string" ? liffIdForButton : undefined);
          if (id) {
            await liffManager.init({ liffId: id }).catch(() => void 0);
          }
        }
      } catch { /* ignore */ }
    };

    const attemptClose = async () => {
      tries++;
      try {
        await ensureLiffReady();

        // まず LIFFで閉じる
        const liffObj = (window as any).liff;
        if (liffObj?.closeWindow) {
          liffObj.closeWindow();
        }

        // フォールバック
        window.close();

        // さらに最終手段：about:blank へ（閉じられないブラウザ対策で画面消し）
        if (tries === 2) {
          location.replace("about:blank");
        }
      } catch { /* ignore */ }
      if (tries >= CLOSE_RETRY_MAX) {
        stopping = true;
        clearInterval(timer);
        // ここでフラグはクリアしておく（再表示させない）
        sessionStorage.removeItem(FORM_REDIRECTED_KEY);
      }
    };
    const shouldAutoClose = () => {
      // フラグ or フォームから戻ってきた痕跡（referrer が Google Forms）
      const flagged = sessionStorage.getItem(FORM_REDIRECTED_KEY) === "1";
      const fromForms = document.referrer.includes("docs.google.com/forms");
      return flagged || fromForms;
    };
    const startClosing = () => {
      if (stopping) return;
      if (!shouldAutoClose()) return;
      // すぐ一発、以降はリトライ
      attemptClose();
      // iOS/Safari や一部WebViewは close が無視されることがあるので、数秒リトライ
      timer = window.setInterval(attemptClose, CLOSE_RETRY_MS);
    };
    // ---- 復帰検知を強化 ----
    const onPageShow = () => startClosing();                // BFCache 復帰
    const onVisibility = () => {                            // タブ復帰
      if (document.visibilityState === "visible") startClosing();
    };
    const onFocus = () => startClosing();                   // フォーカス復帰
    const onPopState = () => startClosing();                // 履歴戻り
    // マウント時にも判定（フォームから戻るパターンはここに来ることが多い）
    startClosing();
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("popstate", onPopState);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("popstate", onPopState);
    };
    // liffIdForButton は ensureLiffReady の再初期化に使うため依存に含める
  }, [liffIdForButton]);
  const closingNow = typeof window !== "undefined" && sessionStorage.getItem(FORM_REDIRECTED_KEY) === "1";
  if (closingNow) {
    // すぐ消えるので白背景のままでOK（ローディングすら不要）
    return <div />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600 p-4">
      {pcOnlyNotice ? (
        <div className="text-center space-y-3">
          <div className="text-gray-800 font-semibold">このページはパソコンでは実行できません</div>
          <p className="text-xs text-gray-500">
            お手数ですが、<span className="font-medium">スマホの LINE から本リンクを開いて</span>実行してください。
          </p>
          <div className="text-[11px] text-gray-400">
            （スマホで開くと自動でフォームに遷移します）
          </div>
        </div>
      ) : showOpenInLine ? (
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
