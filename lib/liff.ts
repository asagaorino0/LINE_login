// lib/liff.ts
export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

let liffLib: any | null = null;

export class LiffManager {
  private static instance: LiffManager;
  private isInitialized = false;

  static getInstance(): LiffManager {
    if (!LiffManager.instance) LiffManager.instance = new LiffManager();
    return LiffManager.instance;
  }

  async init(): Promise<boolean> {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      console.warn('LIFF disabled: NEXT_PUBLIC_LIFF_ID missing');
      this.isInitialized = false;
      return false;
    }
    if (!liffLib) {
      // SSR安全な動的 import
      const mod = await import('@line/liff');
      liffLib = mod.default;
    }
    try {
      await liffLib.init({ liffId, withLoginOnExternalBrowser: true });
      this.isInitialized = true;
      return true;
    } catch (e) {
      console.warn('LIFF init failed:', e);
      this.isInitialized = false;
      return false;
    }
  }

  isLoggedIn(): boolean {
    try { return !!(this.isInitialized && liffLib?.isLoggedIn?.()); }
    catch { return false; }
  }

  // lib/liff.ts
  async login(): Promise<void> {
    if (!this.isInitialized || !liffLib) throw new Error('LIFF not ready');
    if (!liffLib.isLoggedIn?.()) {
      liffLib.login({ redirectUri: window.location.href }); // 未ログイン時だけリダイレクト
    }
    // 既にログイン済みなら何もしない
  }


  async getProfile(): Promise<LiffProfile | null> {
    if (!this.isInitialized || !liffLib?.isLoggedIn?.()) return null;
    try {
      const p = await liffLib.getProfile();
      return { userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl };
    } catch (e) {
      console.warn('getProfile failed:', e);
      return null;
    }
  }

  logout(): void {
    try { liffLib?.logout?.(); } catch { }
  }
}

export const liffManager = LiffManager.getInstance();
