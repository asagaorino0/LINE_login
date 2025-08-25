export interface SubmissionData {
  formUrl: string;
  userId: string;
  additionalMessage?: string;
}

export class GoogleFormsManager {
  public static async submitForm(data: SubmissionData): Promise<{ success: boolean; timestamp: Date }> {
    try {
      // Parse the Google Form URL to extract form ID and create submission URL
      console.log('Processing form URL:', data.formUrl);
      const formId = this.extractFormId(data.formUrl);
      console.log('Extracted form ID:', formId);
      if (!formId) {
        console.error('Failed to extract form ID from URL:', data.formUrl);
        throw new Error('Invalid Google Form URL format');
      }

      // Create form data for submission
      const formData = new FormData();

      // Try to get entry IDs from environment first, then use default for new form
      const userIdEntryId = 'entry.1587760013'; // For USER ID
      const messageEntryId = 'entry.478817684'; // For additional message (if needed)

      console.log('Using entry IDs:', {
        userId: userIdEntryId,
        message: messageEntryId
      });

      // Log form data being submitted  
      console.log('Form submission data:', {
        formUrl: data.formUrl,
        userId: data.userId,
        message: data.additionalMessage
      });

      formData.append(userIdEntryId, data.userId);
      if (data.additionalMessage) {
        formData.append(messageEntryId, data.additionalMessage);
      }

      // Submit to Google Forms - preserve URL structure (/d/e/ vs /d/)
      const submitUrl = this.buildSubmitUrl(data.formUrl, formId);

      console.log('Attempting submission to:', submitUrl);
      console.log('Form data entries:');
      for (const [key, value] of formData.entries()) {
        console.log(`  ${key}: ${value}`);
      }

      try {
        const response = await fetch(submitUrl, {
          method: 'POST',
          body: formData,
          mode: 'no-cors', // Google Forms requires no-cors mode
        });

        console.log('Fetch completed, no-cors response status unknown');

        // Note: With no-cors mode, we can't read the response
        // We assume success if no error was thrown
        return {
          success: true,
          timestamp: new Date(),
        };
      } catch (fetchError) {
        console.error('Fetch error occurred:', fetchError);
        throw fetchError;
      }
    } catch (error) {
      console.error('Google Forms submission failed:', error);
      throw new Error('フォーム送信に失敗しました。URLを確認してください。');
    }
  }

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

      // Verify URL construction is correct
      if (!viewUrl.includes(formId)) {
        throw new Error(`Form ID ${formId} not found in built URL: ${viewUrl}`);
      }

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
          console.log('🌐 Proxy URL:', proxy.url);
          console.log('🌐 Target URL being proxied:', viewUrl);

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

      console.log('📄 Retrieved HTML length:', html?.length || 0);

      if (!html) {
        throw new Error('No HTML content received from proxy');
      }

      // Extract entry IDs with comprehensive patterns
      console.log('🔍 Analyzing HTML structure...');

      // Log a sample of HTML to understand structure (first 1000 chars)
      console.log('📄 HTML sample (first 1000 chars):', html.substring(0, 1000));

      // Also search for specific form-related content
      const formSections = [
        html.indexOf('entry.'),
        html.indexOf('formResponse'),
        html.indexOf('FB_PUBLIC_LOAD_DATA'),
        html.indexOf('data-params'),
        html.indexOf('name=')
      ].filter(i => i !== -1);

      console.log('📍 Form-related content positions:', formSections);

      // Extract sections around entry points
      formSections.forEach((pos, index) => {
        if (pos > 0) {
          const section = html.substring(Math.max(0, pos - 100), pos + 200);
          console.log(`📄 Section ${index + 1} around position ${pos}:`, section);
        }
      });

      // Comprehensive patterns for modern Google Forms
      const patterns = [
        // Traditional patterns
        /name="entry\.(\d+)"/g,
        /entry\.(\d+)/g,
        /"entry\.(\d+)"/g,
        // Modern React/JS patterns
        /entry_(\d+)/g,
        /'entry\.(\d+)'/g,
        /data-params=".*?entry\.(\d+)/g,
        // JSON data patterns
        /\\"entry\.(\d+)\\"/g,
        /\[null,null,(\d+),/g,  // Google's internal format
        // Form action patterns
        /formResponse.*?entry\.(\d+)/g,
        // Embedded script patterns - PRIORITY: Look for [number,null,1] pattern which indicates the actual entry
        /\[(\d{8,}),[^,]*?,null,.*?\[(\d{8,}),null,1\]/g
      ];

      const foundEntries = new Set<string>();

      patterns.forEach((pattern, index) => {
        const matches = Array.from(html.matchAll(pattern));
        const entries = matches.map((match) => {
          // For the priority pattern (last one), use the second capture group
          if (index === patterns.length - 1) {
            return (match as RegExpMatchArray)[2]; // The actual entry ID from [entryId,null,1]
          }
          return (match as RegExpMatchArray)[1];
        }).filter(Boolean);

        console.log(`🎯 Pattern ${index + 1} found:`, entries);
        entries.forEach(entry => {
          if (entry && entry.length >= 8) { // Valid entry IDs are at least 8 digits
            foundEntries.add(`entry.${entry}`);
          }
        });
      });

      const uniqueEntries = Array.from(foundEntries);
      console.log('🎯 All found entry IDs:', uniqueEntries);

      if (uniqueEntries.length === 0) {
        throw new Error('No entry IDs found in HTML');
      }

      // PRIORITY: Look for entry.1587760013 specifically first
      let userIdEntry = uniqueEntries.find(entry => entry.includes('1587760013'));
      if (!userIdEntry) {
        // Fallback to first found entry
        userIdEntry = uniqueEntries[0];
      }

      return {
        userId: userIdEntry,
        message: uniqueEntries[1] || undefined,
        success: true
      };
    } catch (fetchError: any) {
      console.log('❌ All detection methods failed:', fetchError);

      // Fallback: Use common patterns for Google Forms
      const commonEntries = this.getCommonEntryPatterns();
      return {
        userId: commonEntries.userId,
        message: commonEntries.message,
        success: true,
        error: 'Using fallback entry IDs - please test submission'
      };
    }
  }

  private static getCommonEntryPatterns(): { userId: string; message: string } {
    // Use the correct entry ID for this specific form
    return {
      userId: 'entry.1587760013',
      message: 'entry.478817684'
    };
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