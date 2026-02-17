"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [status, setStatus] = useState<string>("初期化中...");
  const [retryKey, setRetryKey] = useState(0);
  const sentRef = useRef(false);

  const retryFlow = useCallback(() => {
    setErr(null);
    setShowAddFriend(false);
    setStatus("友だち状態を再確認中...");
    setRetryKey((v) => v + 1);
  }, []);

  // 通知送信（fetch 本線 / beacon フォールバック / 少し待つ）
  async function sendNotifyCard(payload: any) {
    try {
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
      if (!ok && "sendBeacon" in navigator) {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        ok = navigator.sendBeacon("/api/line", blob);
      }
      await new Promise((r) => setTimeout(r, ok ? 400 : 900));
    } catch (e) {
      console.warn("[notify] failed:", e);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setStatus("URL解析中...");
        console.log("[OPEN] Full URL:", location.href);
        console.log("[OPEN] Search params:", location.search);

        // LIFFログイン後、liff.stateから元のパラメータを復元
        let searchParams = location.search;
        const currentQs = new URLSearchParams(searchParams);
        const liffState = currentQs.get("liff.state");

        if (liffState) {
          setStatus("liff.state復元中...");
          // liff.stateがある場合、それをデコードして元のURLを復元
          try {
            const decodedState = decodeURIComponent(liffState);
            console.log("[OPEN] Decoded liff.state:", decodedState);
            // liff.stateは元のURLパス+クエリ形式（例: /open?lid=xxx&entry=123）
            const stateUrl = new URL(decodedState, location.origin);
            searchParams = stateUrl.search;
            console.log("[OPEN] Restored params from liff.state:", searchParams);
          } catch (e) {
            console.warn("[OPEN] Failed to decode liff.state:", e);
          }
        }

        const qs = new URLSearchParams(searchParams);

        // --- 必須: lid ---
        const lid = (qs.get("lid") || "").trim();
        console.log("[OPEN] lid parameter:", lid);
        if (!lid) throw new Error("NO_LID_IN_URL");

        // --- 1) リンク情報 ---
        setStatus(`リンク情報取得中 (lid=${lid})...`);
        const linkResp = await fetch(`/api/links/${encodeURIComponent(lid)}`, { credentials: "include" });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");
        setStatus("リンク情報取得完了");

        // 公式アカウント情報を取得
        const lineBasicId = link.lineBasicId || "";
        const lineDisplayName = link.lineDisplayName || "";

        // --- 2) LIFF ID（URL > link.liffId > env）---
        const liffIdFromQuery = (qs.get("liff") || qs.get("liffId") || "").trim();
        const liffToUse =
          liffIdFromQuery ||
          (typeof link.liffId === "string" ? link.liffId : "") ||
          (process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID || "");
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");

        setStatus(`LIFF初期化中 (${liffToUse.substring(0, 10)}...)...`);
        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");
        setStatus("LIFF初期化完了");

        // --- 3) ログイン確認 & 実行 ---
        const isLoggedIn = (window as any).liff?.isLoggedIn?.() ?? false;
        console.log("[OPEN] isLoggedIn:", isLoggedIn);
        setStatus(`ログイン状態: ${isLoggedIn ? "ログイン済み" : "未ログイン"}`);
        if (!isLoggedIn) {
          setStatus("LINEログインにリダイレクト中...");
          // 未ログインならログイン実行（LINEアプリ内外問わず）
          await (window as any).liff.login({ redirectUri: location.href });
          return; // リダイレクト→復帰後に以下が続行
        }

        // --- 4) 友だち追加チェック ---
        // デバッグモード: debugShowAddFriend=1 で強制的に友だち追加画面を表示
        setStatus("友だち状態を確認中...");
        const debugShowAddFriend = qs.get("debugShowAddFriend") === "1";

        let isFriend = false;
        let friendshipCheckOk = false;
        if (!debugShowAddFriend) {
          try {
            const friendship = await (window as any).liff.getFriendship();
            isFriend = friendship?.friendFlag ?? false;
            friendshipCheckOk = true;
            // 友だち追加直後は反映が遅れる場合があるため一度だけ再確認
            if (!isFriend) {
              await new Promise((r) => setTimeout(r, 800));
              const friendship2 = await (window as any).liff.getFriendship();
              isFriend = friendship2?.friendFlag ?? false;
              friendshipCheckOk = true;
              console.log("[OPEN] Friendship status (retry):", friendship2);
            }
            setStatus(`友だち状態: ${isFriend ? "追加済み" : "未追加"}`);
            console.log("[OPEN] Friendship status:", friendship);
            console.log("[OPEN] Is friend:", isFriend);
          } catch (e: any) {
            setStatus("友だち状態を取得できないため、確認をスキップして続行します");
            console.warn("[OPEN] getFriendship failed:", e);
            // エラーの場合は続行（LIFF設定/権限で friendship API が使えないケース）
          }
        } else {
          setStatus("デバッグモード: 友だち追加画面を強制表示");
        }

        // 友だち未追加の場合はブロック（またはデバッグモード）
        if ((friendshipCheckOk && !isFriend) || debugShowAddFriend) {
          // 公式アカウント情報をstateに保存（UIで使用）
          (window as any).__lineAccount = { lineBasicId, lineDisplayName };
          setStatus(`友だち追加画面を表示 (lineBasicId: ${lineBasicId || "未設定"})`);
          setShowAddFriend(true);
          console.log("[OPEN] Showing add friend screen (debug mode:", debugShowAddFriend, ")");
          return;
        }

        // --- 5) プロフィール（in-client ならUIDが取れる）---
        setStatus("プロフィール取得中...");
        const profile = await liffManager.getProfile().catch(() => null);
        const uid = profile?.userId || "";
        console.log("[OPEN] LIFF Profile:", profile);
        console.log("[OPEN] LINE UID:", uid);
        setStatus(`UID取得: ${uid ? uid.substring(0, 8) + "..." : "取得できず"}`);

        // --- 5) Google フォーム URL（view に正規化）---
        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);
        const baseForm = viewUrl.split("?")[0];

        // --- 6) entry は “必ず URL からのみ取得” ---
        // 例: ?entry=entry.1587760013 または ?entry=1587760013 どちらも許可
        const entryRaw = String(qs.get("entry") || link.entry || "").trim();
        let entryKey: string | null = null;
        if (entryRaw) {
          entryKey = entryRaw.startsWith("entry.") ? entryRaw : `entry.${entryRaw}`;
          // 明らかに不正な値は破棄
          if (!/^entry\.\d{5,}$/.test(entryKey)) entryKey = null;
          console.log("[OPEN] Entry Key:", entryKey);
        }

        // --- 7) プリフィル URL の構築（URL の entry と UID が両方揃ったときのみ）---
        const prefill =
          uid && entryKey
            ? `${baseForm}?usp=pp_url&${entryKey}=${encodeURIComponent(uid)}`
            : baseForm;
        console.log("[OPEN] Prefill URL:", prefill);

        // --- 8) 通知（ON かつ UID あり のときのみ）---
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

        // --- 9) 遷移 ---
        // （prefill に UID が入っていなければ、そのまま base に飛ぶ）
        setStatus("Googleフォームへ遷移中...");
        setTimeout(() => location.replace(prefill), 120);
      } catch (e: any) {
        console.error("[open] error:", e);
        setErr(e?.message || String(e));
      }
    })();
  }, [retryKey]);

  useEffect(() => {
    if (!showAddFriend) return;

    const onFocus = () => retryFlow();
    const onVisible = () => {
      if (document.visibilityState === "visible") retryFlow();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [showAddFriend, retryFlow]);

  // “LINEで開く”保険（URL の liff をそのまま使う）
  const openInLine = () => {
    const sp = new URLSearchParams(location.search);
    const liffId = (sp.get("liff") || sp.get("liffId") || "").trim();
    if (!liffId) return alert("LIFF ID 不明です");
    const universal = `https://liff.line.me/${encodeURIComponent(liffId)}${location.search || ""}`;
    if ((window as any).liff?.openWindow) {
      (window as any).liff.openWindow({ url: universal, external: false });
    } else {
      location.href = universal;
    }
  };

  // ブラウザ環境でのみ window にアクセス
  const lineAccount = typeof window !== "undefined" ? (window as any).__lineAccount || {} : {};
  const lineBasicId = lineAccount.lineBasicId || "";
  const lineDisplayName = lineAccount.lineDisplayName || "";

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600 p-4">
      {showAddFriend ? (
        <div className="text-center max-w-md space-y-4 p-6">
          <div className="text-xl font-bold text-gray-800 mb-3">友だち追加が必要です</div>
          <p className="text-sm text-gray-700 mb-4 leading-relaxed">
            このフォームをご利用いただくには、<br />
            公式LINEアカウントを友だち追加していただく必要があります。
          </p>
          {lineBasicId ? (
            <>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-xs text-gray-600 mb-2">公式アカウント</p>
                {lineDisplayName && <p className="text-base font-medium text-gray-800">{lineDisplayName}</p>}
                <p className="text-sm text-gray-600 mt-1">{lineBasicId}</p>
              </div>
              <button
                onClick={() => {
                  // LINEアプリ内であれば直接公式アカウントページを開く
                  const lineUrl = `https://line.me/R/ti/p/${encodeURIComponent(lineBasicId)}`;
                  if ((window as any).liff?.openWindow) {
                    (window as any).liff.openWindow({ url: lineUrl, external: false });
                  } else {
                    window.open(lineUrl, "_blank");
                  }
                }}
                className="w-full px-6 py-3 rounded-lg bg-[#06C755] text-white font-medium hover:bg-[#05B24D] transition-colors"
                data-testid="button-add-friend"
              >
                友だち追加ページを開く
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              このリンクは公式アカウント情報が設定されていません。管理者にお問い合わせください。
            </p>
          )}
          <p className="text-xs text-gray-500 mt-4">
            友だち追加後、このページを再度開いてください。
          </p>
          <button
            onClick={retryFlow}
            className="w-full px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            data-testid="button-recheck-friendship"
          >
            友だち追加完了→フォームに移動する
          </button>
        </div>
      ) : showOpenInLine ? (
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
          <div className="text-xs text-gray-400 mt-2">{status}</div>
        </div>
      )}
    </div>
  );
}
