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
  public static async detectEntryIds(formUrl: string): Promise<{ userId?: string; message?: string; success: boolean; error?: string }> {
    try {
      console.log('Attempting to detect entry IDs for form:', formUrl);

      const formId = this.extractFormId(formUrl);
      if (!formId) {
        throw new Error('Could not extract form ID');
      }

      // Convert to viewform URL to analyze structure  
      const viewUrl = this.buildViewUrl(formUrl, formId);
      console.log('🔗 Original form URL:', formUrl);
      console.log('🔗 Extracted form ID:', formId);
      console.log('🔗 Built view URL:', viewUrl);

      let html = null;

      // Try multiple CORS proxy services
      const proxyServices = [
        { name: 'allorigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(viewUrl)}`, contentKey: 'contents' },
        { name: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(viewUrl)}`, contentKey: null },
        { name: 'thingproxy', url: `https://thingproxy.freeboard.io/fetch/${viewUrl}`, contentKey: null }
      ];

      for (const proxy of proxyServices) {
        try {
          console.log(`🔍 Trying ${proxy.name} proxy...`);
          const response = await fetch(proxy.url);

          if (!response.ok) {
            console.log(`❌ ${proxy.name} failed: HTTP ${response.status}`);
            continue;
          }

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

      if (!html) {
        throw new Error('No HTML content received from proxy');
      }

      // Extract entry IDs with comprehensive patterns
      const patterns = [
        /name="entry\.(\d+)"/g,
        /entry\.(\d+)/g,
        /"entry\.(\d+)"/g,
        /entry_(\d+)/g,
        /'entry\.(\d+)'/g,
        /\[(\d{8,}),[^,]*?,null,.*?\[(\d{8,}),null,1\]/g
      ];

      const foundEntries = new Set<string>();

      patterns.forEach((pattern, index) => {
        const matches = Array.from(html.matchAll(pattern));
        const entries = matches.map((match) => {
          if (index === patterns.length - 1) {
            return (match as RegExpMatchArray)[2];
          }
          return (match as RegExpMatchArray)[1];
        }).filter(Boolean);

        entries.forEach(entry => {
          if (entry && entry.length >= 8) {
            foundEntries.add(`entry.${entry}`);
          }
        });
      });

      const uniqueEntries = Array.from(foundEntries);
      console.log('🎯 All found entry IDs:', uniqueEntries);

      if (uniqueEntries.length === 0) {
        throw new Error('No entry IDs found in HTML');
      }

      const userIdEntry = uniqueEntries[0];

      return {
        userId: userIdEntry,
        message: uniqueEntries[1] || undefined,
        success: true
      };
    } catch (fetchError: any) {
      console.log('❌ All detection methods failed:', fetchError);

      return {
        success: false,
        error: 'Entry ID検出に失敗しました。手動検出をお試しください。'
      };
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

  private static extractFormId(url: string): string | null {
    try {
      console.log('🔧 Extracting form ID from URL:', url);

      // Handle both short (forms.gle) and long Google Forms URLs
      const shortFormMatch = url.match(/forms\.gle\/([a-zA-Z0-9_-]+)/);
      if (shortFormMatch) {
        console.log('✅ Short form match found:', shortFormMatch[1]);
        return shortFormMatch[1];
      }

      // Handle /d/e/ format URLs (e.g., /d/e/1FAIpQL...)
      const longFormWithEMatch = url.match(/docs\.google\.com\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
      if (longFormWithEMatch) {
        console.log('✅ Long form with /e/ match found:', longFormWithEMatch[1]);
        return longFormWithEMatch[1];
      }

      // Handle /d/ format URLs (e.g., /d/1FAIpQL...)
      const longFormMatch = url.match(/docs\.google\.com\/forms\/d\/([a-zA-Z0-9_-]+)/);
      if (longFormMatch) {
        console.log('✅ Long form match found:', longFormMatch[1]);
        return longFormMatch[1];
      }

      console.log('❌ No form ID pattern matched');
      return null;
    } catch (error) {
      console.error('Failed to extract form ID:', error);
      return null;
    }
  }

  static validateFormUrl(url: string): boolean {
    const formId = this.extractFormId(url);
    return formId !== null;
  }
}