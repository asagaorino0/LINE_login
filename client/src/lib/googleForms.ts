export interface GoogleFormsSubmission {
  userId: string;
  additionalMessage?: string;
  formUrl: string;
}

export class GoogleFormsManager {
  static async submitToForm(data: GoogleFormsSubmission): Promise<{ success: boolean; timestamp: Date }> {
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
      let userIdEntryId = import.meta.env.VITE_GOOGLE_FORM_USERID_ENTRY;
      let messageEntryId = import.meta.env.VITE_GOOGLE_FORM_MESSAGE_ENTRY;

      // If no environment variables, use the working entry IDs for the new form
      if (!userIdEntryId || !messageEntryId) {
        userIdEntryId = userIdEntryId || 'entry.1587760013';
        messageEntryId = messageEntryId || 'entry.478817684';
      }

      console.log('Submitting to Google Forms with:', {
        userIdEntry: userIdEntryId,
        messageEntry: messageEntryId,
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
      console.log('Analyzing form structure from:', viewUrl);

      try {
        console.log('🔍 Trying CORS proxy method...');
        // Method 2: Use CORS proxy as fallback
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(viewUrl)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
          throw new Error(`Proxy HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const html = data.contents;
        console.log('📄 Retrieved HTML length:', html?.length || 0);

        if (!html) {
          throw new Error('No HTML content received from proxy');
        }

        // Extract entry IDs with multiple patterns
        const patterns = [
          /name="entry\.(\d+)"/g,
          /entry\.(\d+)/g,
          /"entry\.(\d+)"/g
        ];

        let allEntries = [];
        for (const pattern of patterns) {
          const matches = [...html.matchAll(pattern)];
          allEntries.push(...matches.map(m => `entry.${m[1]}`));
        }

        const uniqueEntries = [...new Set(allEntries)];
        console.log('🎯 Found entry IDs with patterns:', uniqueEntries);

        if (uniqueEntries.length === 0) {
          throw new Error('No entry IDs found in HTML');
        }

        return {
          userId: uniqueEntries[0] || undefined,
          message: uniqueEntries[1] || undefined,
          success: true
        };
      } catch (fetchError) {
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
    } catch (error) {
      console.error('Entry ID detection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private static getCommonEntryPatterns(): { userId: string; message: string } {
    // Common patterns observed in Google Forms
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
      // Handle both short (forms.gle) and long Google Forms URLs
      const shortFormMatch = url.match(/forms\.gle\/([a-zA-Z0-9_-]+)/);
      if (shortFormMatch) {
        return shortFormMatch[1];
      }

      // Handle /d/e/ format URLs (e.g., /d/e/1FAIpQL...)
      const longFormWithEMatch = url.match(/docs\.google\.com\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
      if (longFormWithEMatch) {
        return longFormWithEMatch[1];
      }

      // Handle /d/ format URLs (e.g., /d/1FAIpQL...)
      const longFormMatch = url.match(/docs\.google\.com\/forms\/d\/([a-zA-Z0-9_-]+)/);
      if (longFormMatch) {
        return longFormMatch[1];
      }

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
