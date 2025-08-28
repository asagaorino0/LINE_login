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
  ): Promise<{ userId?: string; message?: string; success: boolean; error?: string; title?: string, description?: string }> {
    try {
      console.log('Attempting to detect entry IDs for form:', formUrl);
      const formId = this.extractFormId(formUrl);
      if (!formId) throw new Error('Could not extract form ID');
      const viewUrl = this.buildViewUrl(formUrl, formId);
      console.log('🔗 Built view URL:', viewUrl);
      let html: string | null = null;
      const proxyServices = [
        { name: 'allorigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(viewUrl)}`, contentKey: 'contents' },
        { name: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(viewUrl)}`, contentKey: null },
        { name: 'thingproxy', url: `https://thingproxy.freeboard.io/fetch/${viewUrl}`, contentKey: null }
      ];
      for (const proxy of proxyServices) {
        try {
          console.log(`🔍 Trying ${proxy.name} proxy...`);
          const response = await fetch(proxy.url);
          if (!response.ok) continue;
          if (proxy.contentKey) {
            const data = await response.json();
            html = data[proxy.contentKey];
          } else {
            html = await response.text();
          }
          if (html) {
            console.log(`✅ ${proxy.name} succeeded`);
            break;
          }
        } catch (error: any) {
          console.log(`❌ ${proxy.name} error:`, error.message);
          continue;
        }
      }
      if (!html) throw new Error('No HTML content received from proxy');
      // --- ★ タイトル抽出 ---
      let title: string | undefined;
      const titleTagMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleTagMatch) {
        title = titleTagMatch[1].replace(/ - Google フォーム$/, '').trim();
      } else {
        // fallback: ヘッダーの div から取得
        const headerMatch = html.match(/freebirdFormviewerViewHeaderTitle[^>]*>(.*?)<\/div>/);
        if (headerMatch) {
          title = headerMatch[1].trim();
        }
      }
      console.log('📋 Detected form title:', title);
      // --- ★ description抽出 ---
      let description: string | undefined;
      const descriptionTagMatch = html.match(/<meta[^>]+itemprop=["']description["'][^>]+content=["']([^"']+)["']/i);
      if (descriptionTagMatch) {
        description = descriptionTagMatch[1].trim();
      } else {
        description = 'リンクを開くにはこちらをタップWWW';
      }
      console.log('📋 Detected form title:', title, description);
      // --- Entry ID 抽出処理（既存） ---
      const patterns = [
        /name="entry\.(\d+)"/g,
        /entry\.(\d+)/g,
        /"entry\.(\d+)"/g,
        /entry_(\d+)/g,
        /'entry\.(\d+)'/g,
        /\[(\d{8,}),[^,]*?,null,.*?\[(\d{8,}),null,1\]/g,
      ];
      const foundEntries = new Set<string>();
      patterns.forEach((pattern, index) => {
        const matches = Array.from(html.matchAll(pattern));
        const entries = matches.map((match) =>
          index === patterns.length - 1 ? (match as RegExpMatchArray)[2] : (match as RegExpMatchArray)[1]
        ).filter(Boolean);
        entries.forEach((entry) => {
          if (entry && entry.length >= 8) foundEntries.add(`entry.${entry}`);
        });
      });

      const uniqueEntries = Array.from(foundEntries);
      console.log('🎯 All found entry IDs:', uniqueEntries);

      if (uniqueEntries.length === 0) throw new Error('No entry IDs found in HTML');

      return {
        userId: uniqueEntries[0],
        message: uniqueEntries[1] || undefined,
        title,
        description,
        success: true,
      };
    } catch (fetchError: any) {
      console.log('❌ All detection methods failed:', fetchError);
      return { success: false, error: 'Entry ID検出に失敗しました。手動検出をお試しください。' };
    }
  }


  private static buildViewUrl(originalUrl: string, formId: string): string {
    if (originalUrl.includes('/d/e/')) {
      return `https://docs.google.com/forms/d/e/${formId}/viewform`;
    } else {
      return `https://docs.google.com/forms/d/${formId}/viewform`;
    }
  }

  private static buildSubmitUrl(originalUrl: string, formId: string): string {
    // Preserve the original URL structure and replace viewform with formResponse
    if (originalUrl.includes('/d/e/')) {
      return `https://docs.google.com/forms/d/e/${formId}/formResponse`;
    } else {
      return `https://docs.google.com/forms/d/${formId}/formResponse`;
    }
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
  private static normalizeFormUrl(url: string): string {
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