declare global {
  interface Window {
    liff: any;
  }
}

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export class LiffManager {
  private static instance: LiffManager;
  private isInitialized = false;

  static getInstance(): LiffManager {
    if (!LiffManager.instance) {
      LiffManager.instance = new LiffManager();
    }
    return LiffManager.instance;
  }

  async init(): Promise<boolean> {
    try {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      
      // Development mode - if no LIFF_ID is provided, use mock mode
      if (!liffId) {
        console.warn('LIFF ID is not configured. Running in development mock mode.');
        this.isInitialized = true;
        return true;
      }

      if (!window.liff) {
        throw new Error('LIFF SDK is not loaded. Please include the LIFF SDK script.');
      }

      await window.liff.init({ liffId });
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('LIFF initialization failed:', error);
      // Fallback to mock mode for development
      console.warn('Falling back to development mock mode.');
      this.isInitialized = true;
      return true;
    }
  }

  async login(): Promise<LiffProfile> {
    if (!this.isInitialized) {
      throw new Error('LIFF is not initialized');
    }

    try {
      // Check if in development mode (no actual LIFF)
      if (!process.env.NEXT_PUBLIC_LIFF_ID || !window.liff) {
        // Return mock profile for development
        return {
          userId: `U${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
          displayName: 'デモユーザー',
          pictureUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=400',
        };
      }

      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        // This will redirect, so we won't reach here
        throw new Error('Redirecting to LINE login...');
      }

      const profile = await window.liff.getProfile();
      return {
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      };
    } catch (error) {
      console.error('LINE login failed:', error);
      throw error;
    }
  }

  logout(): void {
    if (this.isInitialized && window.liff && window.liff.isLoggedIn()) {
      window.liff.logout();
    }
  }

  isLoggedIn(): boolean {
    // In development mode without LIFF, always return false initially
    if (!process.env.NEXT_PUBLIC_LIFF_ID || !window.liff) {
      return false;
    }
    return this.isInitialized && window.liff && window.liff.isLoggedIn();
  }

  async getProfile(): Promise<LiffProfile | null> {
    if (!this.isLoggedIn()) {
      return null;
    }

    try {
      // Check if in development mode (no actual LIFF)
      if (!process.env.NEXT_PUBLIC_LIFF_ID || !window.liff) {
        return null;
      }

      const profile = await window.liff.getProfile();
      return {
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      };
    } catch (error) {
      console.error('Failed to get profile:', error);
      return null;
    }
  }
}

export const liffManager = LiffManager.getInstance();