// app/open/OpenFormClient.tsx
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
        const form = qs.get("form");
        const notify = qs.get("notify") === "1";
        const aid = qs.get("aid") || "";
        const formId = qs.get("formId") || "";
        const exp = Number(qs.get("exp") || "0");
        const sig = qs.get("sig") || "";
        const title = qs.get("title") || "Googleフォーム回答通知";

        if (!form) throw new Error("NO_FORM_PARAM");

        await liffManager.init();
        if (!liffManager.isLoggedIn()) {
          await liffManager.login();
          return;
        }
        const profile = await liffManager.getProfile();
        if (!profile?.userId) throw new Error("NO_LIFF_PROFILE");

        function normalizeFormUrlLocal(url: string): string {
          try { url = decodeURIComponent(url); } catch { }
          url = url.trim();

          const token = url.match(/(1FAIpQL[0-9A-Za-z_-]+)/)?.[1];
          if (token) {
            if (url.includes("/forms/d/e/")) return `https://docs.google.com/forms/d/e/${token}/viewform`;
            if (url.includes("/forms/d/")) return `https://docs.google.com/forms/d/${token}/viewform`;
            return `https://docs.google.com/forms/d/e/${token}/viewform`;
          }
          if (/https?:\/\/docs\.google\.com\/forms\/d\/(e\/)?[A-Za-z0-9_-]+\/viewform/.test(url)) {
            return url.split("?")[0];
          }
          return url;
        }

        const viewUrl = normalizeFormUrlLocal(form);

        // const viewUrl = GoogleFormsManager.normalizeFormUrl
        //   ? GoogleFormsManager.normalizeFormUrl(form as string)
        //   : (form as string);

        let userEntry = "entry.1587760013";
        try {
          const det = await GoogleFormsManager.detectEntryIds(viewUrl);
          if (det?.success && det.userId) userEntry = det.userId;
        } catch { }

        const prefill = `${viewUrl.split("?")[0]}?usp=pp_url&${userEntry}=${encodeURIComponent(profile.userId)}`;

        if (notify && !sentRef.current) {
          sentRef.current = true;
          const payload = { userId: profile.userId, type: "card" as const, formUrl: prefill, title, aid, formId, exp, sig };
          try {
            let sent = false;
            if ("sendBeacon" in navigator) {
              const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
              sent = navigator.sendBeacon("/api/line", blob);
            }
            if (!sent) {
              await fetch("/api/line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true });
            }
          } catch { }
        }

        setTimeout(() => location.replace(prefill), 150);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">
      {err ? <>エラー: {err}</> : <>フォームへ遷移中…</>}
    </div>
  );
}
