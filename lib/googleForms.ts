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
      console.log("🔗 Built view URL:", viewUrl);

      let html: string | null = null;
      const proxies = [
        {
          name: "allorigins",
          url: `https://api.allorigins.win/get?url=${encodeURIComponent(viewUrl)}`,
          key: "contents",
        },
        {
          name: "corsproxy",
          url: `https://corsproxy.io/?${encodeURIComponent(viewUrl)}`,
          key: null,
        },
        {
          name: "thingproxy",
          url: `https://thingproxy.freeboard.io/fetch/${viewUrl}`,
          key: null,
        },
      ];

      for (const proxy of proxies) {
        try {
          const res = await fetch(proxy.url);
          if (!res.ok) continue;
          if (proxy.key) {
            const data = await res.json();
            html = data[proxy.key];
          } else {
            html = await res.text();
          }
          if (html) break;
        } catch (err) {
          console.warn(`❌ ${proxy.name} failed:`, (err as Error).message);
          continue;
        }
      }

      if (!html) throw new Error("No HTML content received from proxy");

      // タイトル
      let title: string | undefined;
      const titleTag = html.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleTag) {
        title = titleTag[1].replace(/ - Google フォーム$/, "").trim();
      }

      // description
      let description: string | undefined;
      const descTag = html.match(
        /<meta[^>]+itemprop=["']description["'][^>]+content=["']([^"']+)["']/i
      );
      if (descTag) {
        description = descTag[1].trim();
      }

      // entry ID 抽出
      const patterns = [
        /name="entry\.(\d+)"/g,
        /entry\.(\d+)/g,
        /"entry\.(\d+)"/g,
        /entry_(\d+)/g,
        /'entry\.(\d+)'/g,
        /\[(\d{8,}),[^,]*?,null,.*?\[(\d{8,}),null,1\]/g,
      ];
      const found = new Set<string>();
      patterns.forEach((pattern, index) => {
        const matches = Array.from(html!.matchAll(pattern));
        const entries = matches
          .map((m) =>
            index === patterns.length - 1 ? (m as any)[2] : (m as any)[1]
          )
          .filter(Boolean);
        entries.forEach((e) => {
          if (e && e.length >= 8) found.add(`entry.${e}`);
        });
      });

      const uniqueEntries = Array.from(found);
      if (uniqueEntries.length === 0)
        throw new Error("No entry IDs found in HTML");

      return {
        userId: uniqueEntries[0],
        message: uniqueEntries[1] || undefined,
        title,
        description,
        success: true,
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
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
