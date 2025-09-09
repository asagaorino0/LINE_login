// --- GoogleFormsManager.ts ---
// フォームの項目数が多い場合でも UID を安定検出する版（全文）

export interface GoogleFormsSubmission {
  userId: string;
  additionalMessage?: string;
  formUrl: string;
}

type DetectResult = {
  userId?: string;
  message?: string;
  success: boolean;
  error?: string;
  title?: string;
  description?: string;
};

type Candidate = { id: string; label?: string; kind?: string };

export class GoogleFormsManager {
  /** Google フォームに送信 */
  static async submitToForm(
    data: GoogleFormsSubmission,
    entryIds?: { userId: string; message?: string }
  ): Promise<{ success: boolean; timestamp: Date }> {
    try {
      const formId = this.extractFormId(data.formUrl);
      if (!formId) throw new Error("Invalid Google Form URL format");

      if (!entryIds || !entryIds.userId) {
        throw new Error("Entry IDs must be detected before form submission");
      }

      const formData = new FormData();
      formData.append(entryIds.userId, data.userId);
      if (data.additionalMessage && entryIds.message) {
        formData.append(entryIds.message, data.additionalMessage);
      }

      const submitUrl = this.buildSubmitUrl(data.formUrl, formId);
      await fetch(submitUrl, {
        method: "POST",
        body: formData,
        mode: "no-cors",
      });

      return { success: true, timestamp: new Date() };
    } catch (error) {
      console.error("Google Forms submission failed:", error);
      throw new Error("フォーム送信に失敗しました。URLを確認してください。");
    }
  }

  /** entry ID 検出（ラベル優先・フォールバック強化版） */
  public static async detectEntryIds(formUrl: string): Promise<DetectResult> {
    try {
      const normalized = this.normalizeFormUrl(formUrl);
      const formId = this.extractFormId(normalized);
      if (!formId) throw new Error("Could not extract form ID");

      const viewUrl = this.buildViewUrl(normalized, formId);

      // — 1) HTML取得（URLバリアント×複数プロキシでフォールバック）
      const html = await this.fetchFormHtmlWithFallback(viewUrl);
      if (!html) throw new Error("No HTML content received from proxy");

      // — 2) タイトル・説明
      const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.replace(/ - Google フォーム$/, "")?.trim();
      const description = html.match(/<meta[^>]+itemprop=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim();

      // — 3) 候補抽出：FB_PUBLIC_LOAD_DATA_
      const fromFB = this.extractCandidatesFromFBData(html);

      // — 4) 候補抽出：input/textarea/select や data-params
      const fromInputs = this.extractCandidatesFromInputs(html);

      // — 5) 結合（ID重複はラベルありを優先）
      const merged = new Map<string, Candidate>();
      const merge = (c: Candidate[]) => {
        for (const x of c) {
          const prev = merged.get(x.id);
          if (!prev) merged.set(x.id, x);
          else if (!prev.label && x.label) merged.set(x.id, { ...prev, label: x.label, kind: x.kind ?? prev.kind });
        }
      };
      merge(fromFB);
      merge(fromInputs);

      if (merged.size === 0) throw new Error("No entry IDs found");

      // — 6) スコアリングで UID / メッセージを選ぶ
      const candidates = Array.from(merged.values());

      const labelScore = (label?: string) => {
        if (!label) return 0;
        const l = label.toLowerCase();
        let s = 0;

        // 完全一致を最優先（命名固定が可能なら強力）
        if (/^line\s*user\s*id$/i.test(l)) s += 100;

        if (/(^|\s)(uid)(\s|$)/i.test(label)) s += 5;
        if (/user\s*id/i.test(label)) s += 5;
        if (/line\s*user\s*id/i.test(label)) s += 6;
        if (/[ＩＩＤＵＩＤ]/.test(label)) s += 1; // 全角混じり耐性の微加点
        if (/id/i.test(label)) s += 2;
        if (/ユーザ.?ー?id|利用者.?id|会員.?id|識別子/.test(label)) s += 4;
        if (/(id|uid)/i.test(label)) s += 1; // 短文テキスト欄っぽい
        return s;
      };

      const messageScore = (label?: string) => {
        if (!label) return 0;
        const l = label.toLowerCase();
        let s = 0;
        if (/message|memo|comment/i.test(l)) s += 5;
        if (/メッセージ|備考|コメント|自由記述|ひとこと/.test(label)) s += 6;
        if (/任意|optional/.test(label)) s += 1;
        return s;
      };

      // UID候補
      candidates.sort((a, b) => (labelScore(b.label) - labelScore(a.label)));
      let uidCandidate = candidates[0];

      // ラベルスコアが全滅 → TEXT/ID語含む or 最初の候補を採用（保険）
      if (!uidCandidate || labelScore(uidCandidate.label) <= 0) {
        const textish = candidates.filter(c =>
          /^(SHORT|TEXT|LONG)/i.test(c.kind || "") || /id/i.test(c.label || "")
        );
        uidCandidate = textish[0] ?? candidates[0];
      }

      // メッセージ候補
      const msgSorted = [...candidates].sort((a, b) => (messageScore(b.label) - messageScore(a.label)));
      const msgCandidate = msgSorted[0];
      const messageId = messageScore(msgCandidate?.label) > 0 ? msgCandidate!.id : undefined;

      return {
        userId: uidCandidate?.id ?? candidates[0]?.id, // 最後の保険
        message: messageId,
        title,
        description,
        success: true,
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // =========================
  //  取得系ヘルパー
  // =========================

  /** HTMLを取れるまで URL バリアント×プロキシでフォールバック */
  private static async fetchFormHtmlWithFallback(viewUrl: string): Promise<string> {
    const variants = [
      viewUrl,
      `${viewUrl}${viewUrl.includes('?') ? '&' : '?'}embedded=true`,
      `${viewUrl}${viewUrl.includes('?') ? '&' : '?'}hl=ja`,
      `${viewUrl}${viewUrl.includes('?') ? '&' : '?'}hl=en`,
      `${viewUrl}${viewUrl.includes('?') ? '&' : '?'}usp=pp_url`,
    ];

    const proxies = [
      { name: "allorigins", make: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, key: "contents" as const },
      { name: "corsproxy", make: (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`, key: null },
      { name: "thingproxy", make: (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`, key: null },
    ];

    for (const v of variants) {
      for (const p of proxies) {
        try {
          const res = await fetch(p.make(v));
          if (!res.ok) continue;
          const html = p.key ? (await res.json())[p.key] : await res.text();
          if (!html) continue;

          // FB_PUBLIC_LOAD_DATA_ が含まれているのが理想
          if (html.includes("FB_PUBLIC_LOAD_DATA_")) return html;

          // それが無くても entry.xxx が十分あれば採用
          if (/entry\.\d{8,}/.test(html)) return html;
        } catch {
          // 次の候補へ
        }
      }
    }
    throw new Error("No HTML content received from proxies/variants");
  }

  // =========================
  //  抽出系ヘルパー
  // =========================

  /** FB_PUBLIC_LOAD_DATA_ から設問候補を抜く */
  private static extractCandidatesFromFBData(html: string): Candidate[] {
    const out: Candidate[] = [];
    try {
      const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]+?\]);/);
      if (!m) return out;
      const json = JSON.parse(m[1]);

      // 典型：json[1][1] がページ配列。各ページの [1] が設問配列。
      const pages = (json?.[1]?.[1]) || [];
      const pushItem = (idNum: any, label: any, kind?: any) => {
        if (typeof idNum === "number" && idNum > 10000000) {
          out.push({
            id: `entry.${idNum}`,
            label: typeof label === "string" ? label : undefined,
            kind: typeof kind === "string" ? kind : undefined,
          });
        }
      };

      for (const page of pages) {
        const items = page?.[1] || [];
        for (const it of items) {
          const label = it?.[1];
          // 最も一般的：it[4][0][0] が entryId
          const idA = it?.[4]?.[0]?.[0];
          if (typeof idA === "number") {
            const kind = it?.[3]; // "SHORT_ANSWER" などが入るケースあり
            pushItem(idA, label, kind);
            continue;
          }
          // バリアント探索（深掘り）
          const stack = [it];
          while (stack.length) {
            const cur = stack.pop();
            if (Array.isArray(cur)) {
              for (const v of cur) {
                if (typeof v === "number" && v > 10000000) pushItem(v, label);
                else if (Array.isArray(v)) stack.push(v);
              }
            }
          }
        }
      }
    } catch {
      // noop
    }
    return out;
  }

  /** input/textarea/select と data-params から候補抽出（ラベル付き） */
  private static extractCandidatesFromInputs(html: string): Candidate[] {
    const out: Candidate[] = [];

    // 1) input / textarea / select
    const elementRe = /<(input|textarea|select)\b[^>]*name="(entry\.(\d+))"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = elementRe.exec(html))) {
      const tag = m[1].toLowerCase();
      const id = m[2];

      const chunk = m[0];
      const aria = chunk.match(/\baria-label="([^"]+)"/i)?.[1]?.trim();
      const placeholder = chunk.match(/\bplaceholder="([^"]+)"/i)?.[1]?.trim();
      const labelId = chunk.match(/\baria-labelledby="([^"]+)"/i)?.[1];

      let label: string | undefined = aria || placeholder;

      // label[for=] 紐付け（簡易）
      const forId = chunk.match(/\bid="([^"]+)"/i)?.[1];
      if (!label && (labelId || forId)) {
        const idToFind = (labelId || forId)!.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        const labelMatch = new RegExp(`<label[^>]+for="${idToFind}"[^>]*>([\\s\\S]*?)<\\/label>`, "i").exec(html);
        const text = labelMatch?.[1]?.replace(/<[^>]+>/g, "").trim();
        if (text) label = text;
      }

      const kind =
        tag === "textarea" ? "LONG_ANSWER"
          : tag === "select" ? "SELECT"
            : "SHORT_ANSWER";

      out.push({ id, label, kind });
    }

    // 2) data-params に潜む entry.x を拾う（周辺のテキストをラベル候補に）
    const paramsRe = /\bdata-params="([^"]*entry\.(\d{8,})[^"]*)"/gi;
    while ((m = paramsRe.exec(html))) {
      const id = `entry.${m[2]}`;
      // 近傍のテキストをラベル候補に（簡易）
      const before = html.slice(Math.max(0, m.index - 400), m.index);
      const near = before.match(/>([^<>]{2,60})<\/(div|span|h[1-6]|label)>/i)?.[1]?.trim();
      out.push({ id, label: near, kind: "UNKNOWN" });
    }

    return out;
  }

  // =========================
  //  URLユーティリティ
  // =========================

  /** URLを viewform 用に正規化 */
  private static normalizeFormUrl(url: string): string {
    try {
      url = decodeURIComponent(url).trim();
    } catch { /* noop */ }
    const token = url.match(/(1FAIpQL[0-9A-Za-z_-]+)/)?.[1];
    if (token) {
      if (url.includes("/forms/d/e/")) {
        return `https://docs.google.com/forms/d/e/${token}/viewform`;
      }
      if (url.includes("/forms/d/")) {
        return `https://docs.google.com/forms/d/${token}/viewform`;
      }
      return `https://docs.google.com/forms/d/e/${token}/viewform`;
    }
    return url;
  }

  private static buildViewUrl(originalUrl: string, formId: string): string {
    if (originalUrl.includes("/forms/d/e/")) {
      return `https://docs.google.com/forms/d/e/${formId}/viewform`;
    }
    return `https://docs.google.com/forms/d/${formId}/viewform`;
  }

  private static buildSubmitUrl(originalUrl: string, formId: string): string {
    if (originalUrl.includes("/d/e/")) {
      return `https://docs.google.com/forms/d/e/${formId}/formResponse`;
    }
    return `https://docs.google.com/forms/d/${formId}/formResponse`;
  }

  private static extractFormId(url: string): string | null {
    try {
      url = this.normalizeFormUrl(url);
      const token = url.match(/(1FAIpQL[0-9A-Za-z_-]+)/);
      if (token) return token[1];
      const shortForm = url.match(/forms\.gle\/([a-zA-Z0-9_-]+)/);
      if (shortForm) return shortForm[1];
      const longE = url.match(/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
      if (longE) return longE[1];
      const long = url.match(/forms\/d\/([a-zA-Z0-9_-]+)/);
      if (long) return long[1];
      return null;
    } catch {
      return null;
    }
  }

  static validateFormUrl(url: string): boolean {
    return this.extractFormId(url) !== null;
  }

  /** 外から呼ぶときの viewform 正規化 */
  static toViewUrl(url: string): string {
    return this.normalizeFormUrl(url);
  }
}
