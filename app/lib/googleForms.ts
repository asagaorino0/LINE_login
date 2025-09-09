export interface GoogleFormsSubmission {
  userId: string;
  additionalMessage?: string;
  formUrl: string;
}

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

  /** entry ID 検出 */
  /** entry ID 検出（ラベル優先・頑健版） */
  public static async detectEntryIds(formUrl: string): Promise<{
    userId?: string;
    message?: string;
    success: boolean;
    error?: string;
    title?: string;
    description?: string;
  }> {
    try {
      const normalized = this.normalizeFormUrl(formUrl);
      const formId = this.extractFormId(normalized);
      if (!formId) throw new Error("Could not extract form ID");

      const viewUrl = this.buildViewUrl(normalized, formId);

      // --- 1) HTML取得（プロキシは現状のまま） ---
      let html: string | null = null;
      const proxies = [
        {
          name: "allorigins",
          url: `https://api.allorigins.win/get?url=${encodeURIComponent(viewUrl)}`,
          key: "contents" as const
        },
        {
          name: "corsproxy",
          url: `https://corsproxy.io/?${encodeURIComponent(viewUrl)}`,
          key: null
        },
        {
          name: "thingproxy",
          url: `https://thingproxy.freeboard.io/fetch/${viewUrl}`,
          key: null
        },
      ];
      for (const p of proxies) {
        try {
          const res = await fetch(p.url);
          if (!res.ok) continue;
          html = p.key ? (await res.json())[p.key] : await res.text();
          if (html) break;
        } catch { }
      }
      if (!html) throw new Error("No HTML content received from proxy");

      // --- 2) タイトル・説明（おまけ） ---
      const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.replace(/ - Google フォーム$/, "")?.trim();
      const description = html.match(/<meta[^>]+itemprop=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim();

      // --- 3) 候補抽出：FB_PUBLIC_LOAD_DATA_ の解析 ---
      type Candidate = { id: string; label?: string; kind?: string };
      const fromFB: Candidate[] = GoogleFormsManager.extractCandidatesFromFBData(html);

      // --- 4) 候補抽出：input要素（aria-labelなど）から ---
      const fromInputs: Candidate[] = GoogleFormsManager.extractCandidatesFromInputs(html);

      // 結合（ID重複はラベルありを優先）
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

      // --- 5) スコアリングして UID / メッセージ欄を特定 ---
      const labelScore = (label?: string) => {
        if (!label) return 0;
        const l = label.toLowerCase();
        let s = 0;
        if (/(^|\s)(uid)(\s|$)/i.test(label)) s += 5;
        if (/user\s*id/i.test(label)) s += 5;
        if (/line\s*user\s*id/i.test(label)) s += 6;
        if (/[ＩＩＤＵＩＤ]/.test(label)) s += 1; // 全角混じり耐性の微加点
        if (/id/i.test(label)) s += 2;
        if (/ユーザ.?ー?id|利用者.?id|会員.?id|識別子/.test(label)) s += 4;
        // 短文テキスト欄っぽいものをやや加点
        if (/(id|uid)/i.test(label)) s += 1;
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

      const candidates = Array.from(merged.values());

      // UID候補
      candidates.sort((a, b) => (labelScore(b.label) - labelScore(a.label)));
      const uidCandidate = candidates[0];
      if (!uidCandidate || labelScore(uidCandidate.label) <= 0) {
        // ラベルに頼れない場合のフォールバック：
        // 1) kind が短文/テキスト（推定） 2) IDに近い語を含む aria-label 3) 最後の保険で「最初に見つかった入力」
        const textish = candidates.filter(c => /^(SHORT|TEXT)/i.test(c.kind || "") || /id/i.test(c.label || ""));
        if (textish[0]) candidates[0] = textish[0];
      }

      // メッセージ候補
      const msgSorted = [...candidates].sort((a, b) => (messageScore(b.label) - messageScore(a.label)));
      const msgCandidate = msgSorted[0];
      const messageId = messageScore(msgCandidate?.label) > 0 ? msgCandidate!.id : undefined;

      return {
        userId: candidates[0]?.id,         // ← ラベルスコアで選ばれた UID
        message: messageId,                 // ← 「メッセージ/備考」など
        title,
        description,
        success: true,
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** FB_PUBLIC_LOAD_DATA_ から設問候補を抜く */
  private static extractCandidatesFromFBData(html: string): Array<{ id: string; label?: string; kind?: string }> {
    const out: Array<{ id: string; label?: string; kind?: string }> = [];
    try {
      const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]+?\]);/);
      if (!m) return out;
      const json = JSON.parse(m[1]);
      // 典型形：json[1][1] がページ配列。各ページの [1] が設問配列。設問の entryId は item[4][0][0] あたりに居がち。
      const pages = (json?.[1]?.[1]) || [];
      const pushItem = (idNum: any, label: any, kind?: any) => {
        if (typeof idNum === "number" && idNum > 10000000) out.push({ id: `entry.${idNum}`, label: typeof label === "string" ? label : undefined, kind: typeof kind === "string" ? kind : undefined });
      };
      for (const page of pages) {
        const items = page?.[1] || [];
        for (const it of items) {
          const label = it?.[1];
          // もっとも一般的：it[4][0][0] が entryId
          const idA = it?.[4]?.[0]?.[0];
          if (typeof idA === "number") {
            const kind = it?.[3]; // 種別ヒント（SHORT_ANSWER などが入るケースあり）
            pushItem(idA, label, kind);
            continue;
          }
          // バリアント探索（深めにスキャン）
          const stack = [it];
          while (stack.length) {
            const cur = stack.pop();
            if (Array.isArray(cur)) {
              // 数値（9～11桁）の候補を拾う
              for (const v of cur) {
                if (typeof v === "number" && v > 10000000) {
                  pushItem(v, label);
                } else if (Array.isArray(v)) {
                  stack.push(v);
                }
              }
            }
          }
        }
      }
    } catch { }
    return out;
  }

  /** input[name="entry.x"] と aria-label から候補を抜く */
  private static extractCandidatesFromInputs(html: string): Array<{ id: string; label?: string; kind?: string }> {
    const out: Array<{ id: string; label?: string; kind?: string }> = [];
    const re = /<input[^>]*name="(entry\.(\d+))"[^>]*?(?:aria-label="([^"]+)")?[^>]*?>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const id = m[1];
      const label = m[3]?.trim();
      out.push({ id, label, kind: "SHORT_ANSWER" }); // input は短文扱いのヒント
    }
    return out;
  }


  /** URLを viewform 用に正規化 */
  private static normalizeFormUrl(url: string): string {
    try {
      url = decodeURIComponent(url).trim();
    } catch { }
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
