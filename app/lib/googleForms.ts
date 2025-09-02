export interface GoogleFormsSubmission {
  userId: string;
  additionalMessage?: string;
  formUrl: string;
}

export class GoogleFormsManager {
  static async submitToForm(data: GoogleFormsSubmission, entryIds?: { userId: string; message?: string }): Promise<{ success: boolean; timestamp: Date }> {
    try {
      // Parse the Google Form URL to extract form ID and create submission URL
      console.log('Processing form URL:', data.formUrl);
      const formId = this.extractFormId(data.formUrl);
      console.log('Extracted form ID:', formId);
      if (!formId) {
        console.error('Failed to extract form ID from URL:', data.formUrl);
        throw new Error('Invalid Google Form URL format');
      }

      // Require entry IDs to be provided - no more hardcoded values
      if (!entryIds || !entryIds.userId) {
        throw new Error('Entry IDs must be detected before form submission');
      }

      // Create form data for submission
      const formData = new FormData();

      console.log('Using detected entry IDs:', entryIds);

      // Log form data being submitted  
      console.log('Form submission data:', {
        formUrl: data.formUrl,
        userId: data.userId,
        message: data.additionalMessage
      });

      formData.append(entryIds.userId, data.userId);
      if (data.additionalMessage && entryIds.message) {
        formData.append(entryIds.message, data.additionalMessage);
      }

      // Submit to Google Forms - preserve URL structure (/d/e/ vs /d/)
      const submitUrl = this.buildSubmitUrl(data.formUrl, formId);

      const response = await fetch(submitUrl, {
        method: 'POST',
        body: formData,
        mode: 'no-cors', // Google Forms requires no-cors mode
      });

      // Note: With no-cors mode, we can't read the response
      // We assume success if no error was thrown
      return {
        success: true,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Google Forms submission failed:', error);
      throw new Error('フォーム送信に失敗しました。URLを確認してください。');
    }
  }

  // Add detection method (copied from client/src/lib/googleForms.ts)
  public static async detectEntryIds(
    formUrl: string
  ): Promise<{ userId?: string; message?: string; title?: string; description?: string; success: boolean; error?: string }> {
    try {
      console.log('Attempting to detect entry IDs for form:', formUrl);

      // 1) URL正規化 → それを以降ずっと使う
      const normalized = this.normalizeFormUrl(formUrl);
      const formId = this.extractFormId(normalized);
      if (!formId) throw new Error('Could not extract form ID');

      const viewUrl = this.buildViewUrl(normalized, formId);
      console.log('🔗 Built view URL:', viewUrl);

      // 2) まずは自前APIでHTML解析（CORS回避）
      try {
        const r = await fetch(`/api/forms/inspect?form=${encodeURIComponent(viewUrl)}`);
        if (r.ok) {
          const data = await r.json();
          if (data.success) {
            const entries: string[] = data.entries || [];
            if (entries.length > 0) {
              return {
                userId: entries[0],
                message: entries[1],
                title: data.title || undefined,
                description: data.description || 'リンクを開くにはこちらをタップ',
                success: true,
              };
            }
          }
        }
      } catch {
        // APIが無い/失敗 → 次の手段へ
      }

      // 3) 公開プロキシでHTML取得（最後の手段）
      let html: string | null = null;
      const proxyServices = [
        { name: 'allorigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(viewUrl)}`, contentKey: 'contents' },
        { name: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(viewUrl)}`, contentKey: null },
        { name: 'thingproxy', url: `https://thingproxy.freeboard.io/fetch/${viewUrl}`, contentKey: null },
      ] as const;

      for (const proxy of proxyServices) {
        try {
          console.log(`🔍 Trying ${proxy.name} proxy...`);
          const response = await fetch(proxy.url);
          if (!response.ok) continue;
          html = proxy.contentKey ? (await response.json())[proxy.contentKey] : await response.text();
          if (html) { console.log(`✅ ${proxy.name} succeeded`); break; }
        } catch (err: any) {
          console.log(`❌ ${proxy.name} error:`, err?.message || err);
        }
      }
      if (!html) throw new Error('No HTML content received from proxy');

      // 4) タイトル/説明
      let title: string | undefined;
      const titleTagMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleTagMatch) title = titleTagMatch[1].replace(/ - Google フォーム$/, '').trim();
      if (!title) {
        const headerMatch = html.match(/freebirdFormviewerViewHeaderTitle[^>]*>(.*?)<\/div>/);
        if (headerMatch) title = headerMatch[1].trim();
      }
      let description: string | undefined;
      const descriptionTagMatch = html.match(/<meta[^>]+itemprop=["']description["'][^>]+content=["']([^"']+)["']/i);
      description = descriptionTagMatch ? descriptionTagMatch[1].trim() : 'リンクを開くにはこちらをタップ';

      // 5) entry ID
      const patterns = [
        /name="entry\.(\d+)"/g,
        /"entry\.(\d+)"/g,
        /'entry\.(\d+)'/g,
        /entry_(\d+)/g,
        /\[(\d{8,}),[^,]*?,null,.*?\[(\d{8,}),null,1\]/g,
      ];
      const found = new Set<string>();
      patterns.forEach((re, idx) => {
        const matches = Array.from(html!.matchAll(re));
        matches.forEach((m) => {
          const id = idx === patterns.length - 1 ? (m as RegExpMatchArray)[2] : (m as RegExpMatchArray)[1];
          if (id && id.length >= 8) found.add(`entry.${id}`);
        });
      });

      const uniqueEntries = Array.from(found);
      console.log('🎯 All found entry IDs:', uniqueEntries);
      if (uniqueEntries.length === 0) throw new Error('No entry IDs found in HTML');

      return { userId: uniqueEntries[0], message: uniqueEntries[1], title, description, success: true };
    } catch (e: any) {
      console.log('❌ All detection methods failed:', e);
      return { success: false, error: 'Entry ID検出に失敗しました。フォームURL/公開状態をご確認ください。' };
    }
  }



  private static buildViewUrl(_originalUrl: string, formId: string): string {
    // 1FAIpQL で始まるIDは /d/e/ 形式
    if (/^1FAIpQL/.test(formId)) return `https://docs.google.com/forms/d/e/${formId}/viewform`;
    return `https://docs.google.com/forms/d/${formId}/viewform`;
  }
  private static buildSubmitUrl(_originalUrl: string, formId: string): string {
    if (/^1FAIpQL/.test(formId)) return `https://docs.google.com/forms/d/e/${formId}/formResponse`;
    return `https://docs.google.com/forms/d/${formId}/formResponse`;
  }

  // googleForms.ts
  private static extractFormId(url: string): string | null {
    try {
      console.log('🔧 Extracting form ID from URL (raw):', url);
      url = this.normalizeFormUrl(url); // ★ 正規化を先に実施
      console.log('🔧 Normalized URL:', url);

      // もっとも堅い：トークンそのものを拾う
      const tokenMatch = url.match(/(1FAIpQL[0-9A-Za-z_-]+)/);
      if (tokenMatch) {
        console.log('✅ Detected token:', tokenMatch[1]);
        return tokenMatch[1];
      }
      // フォールバック（念のため残す）
      const shortFormMatch = url.match(/forms\.gle\/([a-zA-Z0-9_-]+)/);
      if (shortFormMatch) return shortFormMatch[1];
      const longE = url.match(/docs\.google\.com\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
      if (longE) return longE[1];
      const long = url.match(/docs\.google\.com\/forms\/d\/([a-zA-Z0-9_-]+)/);
      if (long) return long[1];
      console.log('❌ No form ID pattern matched');
      return null;
    } catch (e) {
      console.error('Failed to extract form ID:', e);
      return null;
    }
  }

  static validateFormUrl(url: string): boolean {
    const formId = this.extractFormId(url);
    return formId !== null;
  }


  // googleForms.ts （GoogleFormsManager 内に追加）
  public static normalizeFormUrl(url: string): string {
    // private static normalizeFormUrl(url: string): string {
    if (!url) return url;

    // 1) 余計なエンコードや空白を除去
    try { url = decodeURIComponent(url); } catch { }
    url = url.trim();

    // 2) 1FAIpQL... のトークンを最初の1つだけ抽出（壊れたURL対策）
    const tokenMatch = url.match(/(1FAIpQL[0-9A-Za-z_-]+)/);
    if (tokenMatch) {
      const token = tokenMatch[1];
      // /d/e/ と /d/ に対応し、常に "viewform" に正規化
      if (url.includes('/forms/d/e/')) {
        return `https://docs.google.com/forms/d/e/${token}/viewform`;
      }
      if (url.includes('/forms/d/')) {
        return `https://docs.google.com/forms/d/${token}/viewform`;
      }
      // それ以外（短縮URLなど）はトークンから /d/e/ に組み立て
      return `https://docs.google.com/forms/d/e/${token}/viewform`;
    }

    // 3) 短縮URL（forms.gle/...）はそのまま返す（解決はブラウザ側/後段に委ねる）
    if (/https?:\/\/forms\.gle\//.test(url)) return url;

    // 4) 既に viewform を含む正常URLならクエリを落として返す
    if (/https?:\/\/docs\.google\.com\/forms\/d\/(e\/)?[A-Za-z0-9_-]+\/viewform/.test(url)) {
      return url.split('?')[0];
    }

    return url; // 最後の手段（この後 extractFormId で弾かれます）
  }
}