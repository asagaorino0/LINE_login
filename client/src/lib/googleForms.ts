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

      // Create form data for submission
      const formData = new FormData();
      
      // Try to get entry IDs from environment first, then try detection
      let userIdEntryId = import.meta.env.VITE_GOOGLE_FORM_USERID_ENTRY;
      let messageEntryId = import.meta.env.VITE_GOOGLE_FORM_MESSAGE_ENTRY;
      
      // If no environment variables, try to detect from form or use test submission
      if (!userIdEntryId || !messageEntryId) {
        console.log('No environment entry IDs found, trying test submission method...');
        const detectedIds = await this.detectEntryIdsViaTest(data.formUrl);
        userIdEntryId = userIdEntryId || detectedIds.userId || 'entry.874267761';
        messageEntryId = messageEntryId || detectedIds.message || 'entry.615708190';
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

  private static async detectEntryIdsViaTest(formUrl: string): Promise<{ userId?: string; message?: string }> {
    try {
      console.log('Attempting to detect entry IDs for form:', formUrl);
      
      // Try common entry ID patterns based on Google Forms structure
      const formId = this.extractFormId(formUrl);
      if (!formId) {
        throw new Error('Could not extract form ID');
      }
      
      // For now, we'll need manual configuration or user input
      // Return empty to force manual configuration
      console.log('Entry ID detection requires manual configuration');
      return {};
    } catch (error) {
      console.log('Could not detect entry IDs:', error);
      return {};
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
