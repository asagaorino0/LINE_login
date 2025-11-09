"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

/**
 * クエリで渡せるパラメータ例
 *   lid=xxxxx                 // /api/links/[lid] のキー（必須）
 *   liff=2008...-abc          // LIFF ID（任意、指定があればそれを最優先）
 *   entry=123456 or entry.123456 // UIDを入れるフォームのentryキー（任意。links側のentryが優先）
 *   nameEntry=654321          // displayNameを入れるentryキー
 *   iconEntry=777777          // pictureUrlを入れるentryキー（URL文字列として保存される）
 */
export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
  const [showOpenInLine, setShowOpenInLine] = useState(false);
  const sentRef = useRef(false);

  // --- 通知送信（fetch 本線 / Beacon フォールバック）---
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
      // 送信完了を待つため少しだけ待機
      await new Promise((r) => setTimeout(r, ok ? 300 : 800));
    } catch (e) {
      console.warn("[notify] failed:", e);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams(location.search);

        // --- 0) lid は必須 ---
        const lid = (qs.get("lid") || "").trim();
        if (!lid) throw new Error("NO_LID_IN_URL");

        // --- 1) リンク情報を取得 ---
        const linkResp = await fetch(`/api/links/${encodeURIComponent(lid)}${location.search ? `?${location.search}` : ""}`, {
          credentials: "include",
          cache: "no-store",
        });
        const link = await linkResp.json();
        if (!linkResp.ok || !link?.ok) throw new Error(link?.code || "LINK_NOT_FOUND");

        const formUrlFromLink: string = link.formUrl; // すでに viewform に正規化済み
        const entryFromLink: string | undefined = link.entry || undefined;
        const notifyFlag: number = Number(link.notify) || 0;

        // --- 2) 使用する LIFF ID（URL > links > env の優先順）---
        const liffIdFromQuery = (qs.get("liff") || qs.get("liffId") || "").trim();
        const liffToUse: string =
          liffIdFromQuery ||
          (typeof link.liffId === "string" ? link.liffId : "") ||
          (process.env.NEXT_PUBLIC_DEFAULT_LIFF_ID || "");
        if (!liffToUse) throw new Error("LIFF ID が未設定です。");

        // --- 3) LIFF 初期化 ---
        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        // --- 4) LINEアプリ内 or 外部ブラウザ を判定 ---
        const inClient =
          typeof (window as any).liff?.isInClient === "function"
            ? (window as any).liff.isInClient()
            : (liffManager as any).isInClient?.() ?? false;

        // 外部ブラウザなら「LINEで開く」導線を出す
        if (!inClient) setShowOpenInLine(true);

        // --- 5) ログイン状態を確保（外部ブラウザなど）---
        // すでにログイン済みか判定し、未ログインなら SSO で silent login を試す
        const isLoggedIn = !!(window as any).liff?.isLoggedIn?.();
        if (!isLoggedIn) {
          await (window as any).liff.login({ redirectUri: location.href, prompt: "none" });
          return; // ここでリダイレクト→復帰後に続行
        }

        // --- 6) プロフィール＆IDトークン 取得 ---
        //   getProfile(): { userId, displayName, pictureUrl, ... }
        //   getDecodedIDToken(): { sub(=userId), name, picture, ... } ※openidスコープが必要
        let profile: any = null;
        try {
          profile = await liffManager.getProfile();
        } catch {
          profile = null;
        }
        const idt: any = (window as any).liff?.getDecodedIDToken?.() || null;

        const uid = (profile?.userId || idt?.sub || "") as string;
        const displayName = (profile?.displayName || idt?.name || "") as string;
        const pictureUrl = (profile?.pictureUrl || idt?.picture || "") as string;

        // --- 7) Google フォームURL をベースにする ---
        const baseForm = GoogleFormsManager.toViewUrl(formUrlFromLink).split("?")[0];

        // --- 8) entry キーの決定（URL の entry は “常に許可” するが、linksの定義があればそれを優先）
        //     例: ?entry=entry.1587760013 または ?entry=1587760013 どちらも許可
        function normalizeEntryKey(v: string | null | undefined) {
          if (!v) return null;
          const t = v.trim();
          const k = t.startsWith("entry.") ? t : `entry.${t}`;
          return /^entry\.\d{5,}$/.test(k) ? k : null; // 数字5桁以上のみ許可
        }
        const entryFromQuery = normalizeEntryKey(qs.get("entry"));
        const uidEntryKey = normalizeEntryKey(entryFromLink || entryFromQuery);

        // --- 9) displayName / pictureUrl の entry キー（任意）
        const nameEntryKey = normalizeEntryKey(qs.get("nameEntry"));
        const iconEntryKey = normalizeEntryKey(qs.get("iconEntry"));

        // --- 10) プリフィルURLの作成 ---
        const prefillParams = new URLSearchParams();
        // UID
        if (uid && uidEntryKey) prefillParams.set(uidEntryKey, uid);
        // displayName
        if (displayName && nameEntryKey) prefillParams.set(nameEntryKey, displayName);
        // pictureUrl（URL文字列として保存される。フォーム上で画像表示はされない）
        if (pictureUrl && iconEntryKey) prefillParams.set(iconEntryKey, pictureUrl);

        const prefill = prefillParams.toString()
          ? `${baseForm}?usp=pp_url&${prefillParams.toString()}`
          : baseForm;

        // --- 11) 通知（ON かつ UIDあり のとき）---
        if (!sentRef.current && notifyFlag === 1 && uid) {
          sentRef.current = true;
          const payload = {
            userId: uid,
            displayName,
            pictureUrl,
            type: "card" as const,
            formUrl: prefill,
            title: (link.title as string) || "Googleフォーム",
            desc:
              (link.desc as string) ||
              "※こちらご対応頂くことで弊社からご連絡することが可能になります。必ずご回答ください。",
            bgcolor: link.bgcolor,
            lid,
          };
          await sendNotifyCard(payload);
        }

        // --- 12) 遷移（prefillに何も入らない場合は素のviewへ）---
        setTimeout(() => {
          location.replace(prefill);
        }, 120);
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
          <p className="text-xs text-gray-500">LINEアプリで開くとユーザー情報（UID/名前/アイコン）を自動反映できます。</p>
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
