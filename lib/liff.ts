// lib/liff.ts
export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

type LiffSDK = {
  init(input: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opt?: { redirectUri?: string }): void;
  logout(): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  getIDToken(): string | null;      // 公式は大文字ID
  getAccessToken(): string | null;
  getDecodedIDToken(): any;
};

let liffLib: LiffSDK | null = null;
const LIFF_ID_KEY = "liffId";

export class LiffManager {
  private static instance: LiffManager;
  private initialized = false;
  private currentLiffId?: string;

  private constructor() { }
  static getInstance(): LiffManager {
    if (!LiffManager.instance) LiffManager.instance = new LiffManager();
    return LiffManager.instance;
  }

  /** 現在使用中の LIFF ID を返す */
  getLiffId() {
    return this.currentLiffId;
  }

  /** 初期化（liffIdOverride > URL > localStorage > env の順で決定） */
  async init(opts?: { liffIdOverride?: string; preferServer?: boolean }): Promise<boolean> {
    // preferServer は無視（サーバ参照は呼び出し側で fetch する方針）
    if (typeof window === "undefined") return false; // SSR対策

    if (!liffLib) {
      const mod = await import("@line/liff");
      liffLib = mod.default as unknown as LiffSDK;
    }

    // env の安全取得
    const envLiffId: string | null = (() => {
      const v = process.env.NEXT_PUBLIC_LIFF_ID; // string | undefined
      return typeof v === "string" && v.length > 0 ? v : null;
    })();

    // URLクエリを一度だけパース
    const sp = new URLSearchParams(window.location.search);

    // liffId 決定順序
    let liffId: string | null =
      opts?.liffIdOverride?.trim() ||
      sp.get("liff") ||
      sp.get("liffId") ||
      (() => {
        try { return localStorage.getItem(LIFF_ID_KEY); } catch { return null; }
      })() ||
      envLiffId;

    if (!liffId) {
      console.warn("[LIFF] liffId not found. Initialization skipped.");
      this.initialized = false;
      this.currentLiffId = undefined;
      return false;
    }

    // 既に初期化済みで、同じ liffId なら再初期化不要
    if (this.initialized) {
      if (this.currentLiffId && this.currentLiffId !== liffId) {
        // 異なる LIFF ID での再初期化を許可する場合のみリセット
        try { liffLib.logout?.(); } catch { }
        this.initialized = false;
      } else {
        return true;
      }
    }

    try {
      await liffLib.init({ liffId });
      this.initialized = true;
      this.currentLiffId = liffId;
      try { localStorage.setItem(LIFF_ID_KEY, liffId); } catch { }
      return true;
    } catch (e) {
      console.error("[LIFF] init failed:", e);
      this.initialized = false;
      this.currentLiffId = undefined;
      return false;
    }
  }

  /** 旧コード互換：未ログインなら LINE ログインへ遷移 */
  ensureLogin(redirectUri?: string) {
    if (!this.initialized || !liffLib) {
      console.warn("[LIFF] ensureLogin called before init().");
      return;
    }
    if (!liffLib.isLoggedIn()) {
      liffLib.login(redirectUri ? { redirectUri } : undefined);
    }
  }

  isLoggedIn(): boolean {
    return !!(this.initialized && liffLib && liffLib.isLoggedIn());
  }

  login(redirectUri?: string) {
    if (!liffLib) return;
    try {
      liffLib.login(redirectUri ? { redirectUri } : undefined);
    } catch (e) {
      console.error("[LIFF] login failed:", e);
    }
  }

  logout() {
    if (!liffLib) return;
    try {
      liffLib.logout();
      this.initialized = false;
    } catch (e) {
      console.error("[LIFF] logout failed:", e);
    }
  }

  async getProfile(): Promise<LiffProfile | null> {
    if (!this.isLoggedIn() || !liffLib) return null;
    try {
      const p = await liffLib.getProfile();
      return { userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl };
    } catch (e) {
      console.error("[LIFF] getProfile failed:", e);
      return null;
    }
  }

  /** getIDToken() を隠蔽したラッパー（サーバ検証用に使用） */
  async getIdToken(): Promise<string | null> {
    try {
      return liffLib?.getIDToken?.() ?? null;
    } catch (e) {
      console.error("[LIFF] getIDToken failed:", e);
      return null;
    }
  }

  getAccessToken(): string | null {
    try {
      return liffLib?.getAccessToken?.() ?? null;
    } catch {
      return null;
    }
  }

  getDecodedIDToken(): any | null {
    try {
      return liffLib?.getDecodedIDToken?.() ?? null;
    } catch {
      return null;
    }
  }
}

// 使い回し用シングルトン
export const liffManager = LiffManager.getInstance();
