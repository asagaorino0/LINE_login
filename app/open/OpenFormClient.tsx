"use client";

import { useEffect, useRef, useState } from "react";
import { liffManager } from "@/lib/liff";
import { GoogleFormsManager } from "@/lib/googleForms";

export default function OpenFormClient() {
  const [err, setErr] = useState<string | null>(null);
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
        if (!linkResp.ok || !link?.ok) {
          const code = link?.code || "LINK_NOT_FOUND";
          throw new Error(code);
        }

        // 2) LIFF ID の決定（URL > link.liffId > env）
        const liffFromQuery = qs.get("liff") || qs.get("liffId");
        const liffToUse = (liffFromQuery || link.liffId || undefined) as string | undefined;
        if (!liffToUse) {
          throw new Error("LIFF ID が未設定です。URLに &liff=... を付けるか、link.liffId を保存してください。");
        }

        const ok = await liffManager.init({ liffId: liffToUse });
        if (!ok) throw new Error("LIFF 初期化に失敗しました。");

        if (!liffManager.isLoggedIn()) {
          // 現在URLに liffId を付けて戻す（liff.ts 内でも付け直しますが念のため）
          const back = new URL(location.href);
          back.searchParams.set("liffId", liffToUse);
          await liffManager.login({ redirectUri: back.toString() });
          return;
        }

        // 3) ユーザー保存（Cookie要るなら /api/line-admin もここで）
        const profile = await liffManager.getProfile();
        if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");

        // （任意）管理者Cookie化が必要なら：await fetch("/api/line-admin", { method:"POST", body: JSON.stringify({...}) })
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

        // 4) フォームURL → view に正規化
        const viewUrl = GoogleFormsManager.toViewUrl(link.formUrl);

        // 5) entry 決定（URL > link.entry > 自動検出）
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

        // 6) prefill 作成
        const prefill = `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(profile.userId)}`;

        // 7) （通知ONなら）LINEへ送信
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

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600 p-4">
      {err ? (
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