"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const sentRef = useRef(false);

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
        const qs = new URLSearchParams(location.search);

        // --- 必須: lid ---
        const lid = (qs.get("lid") || "").trim();
        if (!lid) throw new Error("NO_LID_IN_URL");

        // --- 1) リンク情報 ---
        const linkResp = await fetch(`/api/links/${encodeURIComponent(lid)}`, { credentials: "include" });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        // --- 2) LIFF ID（URL > link.liffId > env）---
        const liffIdFromQuery = (qs.get("liff") || qs.get("liffId") || "").trim();
        const liffToUse =
          liffIdFromQuery ||
          (typeof link.liffId === "string" ? link.liffId : "") ||
          (process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID || "");
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");

        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        // --- 3) LINE アプリ内か？ ---
        const inClient =
          typeof (window as any).liff?.isInClient === "function"
            ? (window as any).liff.isInClient()
            : (liffManager as any).isInClient?.() ?? false;

        // in-client かつ未ログインならサイレント SSO（prompt:none）
        if (inClient && !(window as any).liff?.isLoggedIn?.()) {
          await (window as any).liff.login({ redirectUri: location.href, prompt: "none" });
          return; // ここでリダイレクト→復帰後に以下が続行
        }

        // --- 4) プロフィール（in-client ならUIDが取れる）---
        const profile = await liffManager.getProfile().catch(() => null);
        const uid = profile?.userId || "";
        console.log("[OPEN] LIFF Profile:", profile);
        console.log("[OPEN] LINE UID:", uid);

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
        setTimeout(() => location.replace(prefill), 120);
      } catch (e: any) {
        console.error("[open] error:", e);
        setErr(e?.message || String(e));
      }
    })();
  }, []);

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
