// app/(public)/HomeClient.tsx など好きな場所に
"use client";

import { useEffect, useRef } from "react";

export default function HomeClient() {
  const postedRef = useRef(false);

  useEffect(() => {
    if (postedRef.current) return;

    const qs = new URLSearchParams(window.location.search);
    if (qs.get("notify") !== "1") return;          // 通知フラグがあるときだけ動く

    // 署名付きパラメータ（/api/make-link が付与）
    const formUrl = qs.get("form") ?? "";
    const aid = qs.get("aid") ?? "";
    const exp = Number(qs.get("exp") ?? "0");
    const sig = qs.get("sig") ?? "";
    // formId は query に無いこともあるので、formUrl から抽出も試す
    const formId = qs.get("formId") ?? extractFormId(formUrl) ?? "";

    // 送信先の LINE ユーザーID（Uから始まる32+桁）
    // 1) ?userId=... があればそれを使う
    // 2) 無ければ、Googleフォームの prefill パラメータ（entry.XXXX=U...）から拾う
    const userId = qs.get("userId") ?? extractUserIdFromFormUrl(formUrl);

    // バリデーション
    if (!userId || !/^U[0-9a-f]{32,}$/i.test(userId)) {
      console.warn("[notify] userId が見つからない/不正です");
      return;
    }
    if (!aid || !formId || !exp || !sig) {
      console.warn("[notify] 署名パラメータが不足しています");
      return;
    }

    postedRef.current = true;

    // 通知（テキスト）
    fetch("/api/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        type: "text",
        message: "フォームを開きました（プレビュー）",
        // 署名付き（どの管理者の資格情報を使うか）
        aid, formId, exp, sig,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text();
          console.error("[notify] /api/line 失敗:", res.status, t);
        } else {
          console.log("[notify] /api/line 成功");
        }
      })
      .catch((e) => console.error("[notify] /api/line エラー", e));
  }, []);

  return null; // 画面は既存の UI をそのまま表示するなら何も描画しない
}

/* ---- ヘルパー ---- */
function extractFormId(formUrl: string): string | null {
  try {
    const m = formUrl.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function extractUserIdFromFormUrl(formUrl: string): string | null {
  try {
    const u = new URL(formUrl);
    for (const [k, v] of u.searchParams) {
      // 例）viewform?usp=pp_url&entry.1587760013=Uxxxxxxxx...
      if (k.startsWith("entry.") && /^U[0-9a-f]{32,}$/i.test(v)) return v;
    }
    return null;
  } catch {
    return null;
  }
}
