export interface GoogleFormsSubmission {
  userId: string;
  additionalMessage?: string;
  formUrl: string;
}

export class GoogleFormsManager {
  static async submitToForm(data: GoogleFormsSubmission): Promise<{ success: boolean; timestamp: Date }> {
    try {
      // Parse the Google Form URL to extract form ID and create submission URL
      const formId = this.extractFormId(data.formUrl);
      if (!formId) {
        throw new Error('Invalid Google Form URL format');
      }

      // Try to auto-detect entry IDs if not provided in environment
      const entryIds = await this.detectEntryIds(data.formUrl);
      
      // Create form data for submission
      const formData = new FormData();
      
      // Use detected or environment-configured entry IDs
      const userIdEntryId = import.meta.env.VITE_GOOGLE_FORM_USERID_ENTRY || entryIds.userId || 'entry.1234567890';
      const messageEntryId = import.meta.env.VITE_GOOGLE_FORM_MESSAGE_ENTRY || entryIds.message || 'entry.1234567891';
      
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

      // Submit to Google Forms
      const submitUrl = `https://docs.google.com/forms/d/${formId}/formResponse`;
      
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

  private static async detectEntryIds(formUrl: string): Promise<{ userId?: string; message?: string }> {
    try {
      // Try to fetch the form page and extract entry IDs
      const response = await fetch(formUrl, { mode: 'cors' });
      const html = await response.text();
      
      // Look for entry IDs in the HTML
      const entryMatches = html.match(/entry\.\d+/g);
      
      if (entryMatches && entryMatches.length >= 2) {
        return {
          userId: entryMatches[0],
          message: entryMatches[1]
        };
      }
    } catch (error) {
      console.log('Could not auto-detect entry IDs, using defaults');
    }
    
    return {};
  }

  private static extractFormId(url: string): string | null {
    try {
      // Handle both short (forms.gle) and long Google Forms URLs
      const shortFormMatch = url.match(/forms\.gle\/([a-zA-Z0-9_-]+)/);
      if (shortFormMatch) {
        return shortFormMatch[1];
      }

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
