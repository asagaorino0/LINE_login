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
      const liffId = import.meta.env.VITE_LIFF_ID;
      
      // Development mode - if no LIFF_ID is provided, use mock mode
      if (!liffId) {
        console.warn('LIFF ID is not configured. Running in development mock mode.');
        this.isInitialized = true;
        return true;
      }

      // Wait for LIFF SDK to load if not available yet
      await this.waitForLiff();

      if (!window.liff) {
        throw new Error('LIFF SDK failed to load after waiting.');
      }

      await window.liff.init({ liffId });
      this.isInitialized = true;
      console.log('LIFF initialized successfully');
      return true;
    } catch (error) {
      console.error('LIFF initialization failed:', error);
      // Fallback to mock mode for development
      console.warn('Falling back to development mock mode.');
      this.isInitialized = true;
      return true;
    }
  }

  private async waitForLiff(maxAttempts = 50): Promise<void> {
    let attempts = 0;
    while (!window.liff && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.liff) {
      // Try to load LIFF SDK dynamically
      await this.loadLiffSdk();
    }
  }

  private async loadLiffSdk(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.liff) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.charset = 'utf-8';
      script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load LIFF SDK'));
      document.head.appendChild(script);
    });
  }

  async login(): Promise<LiffProfile> {
    if (!this.isInitialized) {
      throw new Error('LIFF is not initialized');
    }

    try {
      // Check if in development mode (no actual LIFF)
      if (!import.meta.env.VITE_LIFF_ID || !window.liff) {
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
    if (this.isInitialized && window.liff.isLoggedIn()) {
      window.liff.logout();
    }
  }

  isLoggedIn(): boolean {
    // In development mode without LIFF, always return false initially
    if (!import.meta.env.VITE_LIFF_ID || !window.liff) {
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
      if (!import.meta.env.VITE_LIFF_ID || !window.liff) {
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
