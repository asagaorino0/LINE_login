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
      
      // These entry IDs would need to be configured based on your specific Google Form
      // You can find these by inspecting the form HTML or using Google Forms API
      const userIdEntryId = process.env.NEXT_PUBLIC_GOOGLE_FORM_USERID_ENTRY || 'entry.123456789';
      const messageEntryId = process.env.NEXT_PUBLIC_GOOGLE_FORM_MESSAGE_ENTRY || 'entry.987654321';
      
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