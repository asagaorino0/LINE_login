// lib/liff.ts
export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

let liffLib: any | null = null;

const isBrowser = () => typeof window !== "undefined";

export class LiffManager {
  private static instance: LiffManager;
  private isInitialized = false;
  private currentLiffId: string | null = null;

  static getInstance(): LiffManager {
    if (!LiffManager.instance) LiffManager.instance = new LiffManager();
    return LiffManager.instance;
  }

  get initialized() {
    return this.isInitialized;
  }
  get liffId() {
    return this.currentLiffId;
  }
  /** 明示的に liffId を保持させたい場合に使用（任意） */
  setLiffId(id: string | null) {
    this.currentLiffId = id && id.trim() ? id.trim() : null;
  }
  /** 利便性のためのゲッター関数 */
  getLiffId(): string | null {
    return this.currentLiffId;
  }

  private async importSdk() {
    if (!liffLib) {
      const mod = await import("@line/liff");
      liffLib = mod.default;
    }
  }

  private liffIdFromUrl(): string | null {
    if (!isBrowser()) return null;
    const s = new URLSearchParams(window.location.search).get("liffId");
    if (s && /^\d{6,}-[A-Za-z0-9_-]+$/.test(s)) return s;
    return null;
  }

  private async liffIdFromServer(): Promise<string | null> {
    if (!isBrowser()) return null;
    try {
      const r = await fetch("/api/liff-settings", {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) return null; // 401含む
      const j = await r.json();
      return (j?.liffId && typeof j.liffId === "string") ? j.liffId : null;
    } catch {
      return null;
    }
  }

  /** 優先度: 明示引数 > 既存保持値 > /api/liff-settings > URL(?liffId=) > env */
  async init(opts?: { liffId?: string }): Promise<boolean> {
    await this.importSdk();

    const resolved =
      (opts?.liffId && opts.liffId.trim()) ||
      this.currentLiffId ||
      (await this.liffIdFromServer()) ||
      this.liffIdFromUrl() ||
      (process.env.NEXT_PUBLIC_LIFF_ID || "");

    if (!resolved) {
      console.warn("[LIFF] liffId not found. Initialization skipped.");
      this.isInitialized = false;
      return false;
    }

    this.currentLiffId = resolved;
    try {
      await liffLib.init({ liffId: resolved });
      this.isInitialized = true;
      return true;
    } catch (e) {
      console.error("[LIFF] init failed:", e);
      this.isInitialized = false;
      return false;
    }
  }

  isLoggedIn(): boolean {
    try {
      return !!liffLib && liffLib.isLoggedIn();
    } catch {
      return false;
    }
  }

  /** LIFF公式の login({ redirectUri? }) を透過させる */
  async login(opts?: { redirectUri?: string }): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Call init({ liffId }) before login().");
    }
    // liff.login は非同期戻り値を返さないが await 可（即時解決）
    await liffLib.login(opts);
  }

  async logout(): Promise<void> {
    if (!liffLib) return;
    try { liffLib.logout(); } catch { }
  }

  async getProfile(): Promise<LiffProfile | null> {
    if (!this.isInitialized) return null;
    const p = await liffLib.getProfile();
    if (!p) return null;
    return {
      userId: p.userId,
      displayName: p.displayName,
      pictureUrl: p.pictureUrl,
    };
  }

  /** 便利メソッド：IDトークン（存在しない/未ログインなら null） */
  async getIdToken(): Promise<string | null> {
    try {
      const tok = liffLib.getIDToken?.();
      return tok ?? null;
    } catch {
      return null;
    }
  }
}

export const liffManager = LiffManager.getInstance();


// // lib/liff.ts
// export interface LiffProfile {
//   userId: string;
//   displayName: string;
//   pictureUrl?: string;
// }

// type LiffSDK = {
//   init(input: { liffId: string }): Promise<void>;
//   isLoggedIn(): boolean;
//   login(opt?: { redirectUri?: string }): void;
//   logout(): void;
//   getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
//   getIDToken(): string | null;      // 公式は大文字ID
//   getAccessToken(): string | null;
//   getDecodedIDToken(): any;
// };

// let liffLib: LiffSDK | null = null;
// const LIFF_ID_KEY = "liffId";

// export class LiffManager {
//   private static instance: LiffManager;
//   private initialized = false;
//   private currentLiffId?: string;

//   private constructor() { }
//   static getInstance(): LiffManager {
//     if (!LiffManager.instance) LiffManager.instance = new LiffManager();
//     return LiffManager.instance;
//   }

//   /** 現在使用中の LIFF ID を返す */
//   getLiffId() {
//     return this.currentLiffId;
//   }

//   /** 初期化（liffIdOverride > URL > localStorage > env の順で決定） */
//   async init(opts?: { liffIdOverride?: string; preferServer?: boolean }): Promise<boolean> {
//     // preferServer は無視（サーバ参照は呼び出し側で fetch する方針）
//     if (typeof window === "undefined") return false; // SSR対策

//     if (!liffLib) {
//       const mod = await import("@line/liff");
//       liffLib = mod.default as unknown as LiffSDK;
//     }

//     // env の安全取得
//     const envLiffId: string | null = (() => {
//       const v = process.env.NEXT_PUBLIC_LIFF_ID; // string | undefined
//       return typeof v === "string" && v.length > 0 ? v : null;
//     })();

//     // URLクエリを一度だけパース
//     const sp = new URLSearchParams(window.location.search);

//     // liffId 決定順序
//     let liffId: string | null =
//       opts?.liffIdOverride?.trim() ||
//       sp.get("liff") ||
//       sp.get("liffId") ||
//       (() => {
//         try { return localStorage.getItem(LIFF_ID_KEY); } catch { return null; }
//       })() ||
//       envLiffId;

//     if (!liffId) {
//       console.warn("[LIFF] liffId not found. Initialization skipped.");
//       this.initialized = false;
//       this.currentLiffId = undefined;
//       return false;
//     }

//     // 既に初期化済みで、同じ liffId なら再初期化不要
//     if (this.initialized) {
//       if (this.currentLiffId && this.currentLiffId !== liffId) {
//         // 異なる LIFF ID での再初期化を許可する場合のみリセット
//         try { liffLib.logout?.(); } catch { }
//         this.initialized = false;
//       } else {
//         return true;
//       }
//     }

//     try {
//       await liffLib.init({ liffId });
//       this.initialized = true;
//       this.currentLiffId = liffId;
//       try { localStorage.setItem(LIFF_ID_KEY, liffId); } catch { }
//       return true;
//     } catch (e) {
//       console.error("[LIFF] init failed:", e);
//       this.initialized = false;
//       this.currentLiffId = undefined;
//       return false;
//     }
//   }

//   /** 旧コード互換：未ログインなら LINE ログインへ遷移 */
//   ensureLogin(redirectUri?: string) {
//     if (!this.initialized || !liffLib) {
//       console.warn("[LIFF] ensureLogin called before init().");
//       return;
//     }
//     if (!liffLib.isLoggedIn()) {
//       liffLib.login(redirectUri ? { redirectUri } : undefined);
//     }
//   }

//   isLoggedIn(): boolean {
//     return !!(this.initialized && liffLib && liffLib.isLoggedIn());
//   }

//   login(redirectUri?: string) {
//     if (!liffLib) return;
//     try {
//       liffLib.login(redirectUri ? { redirectUri } : undefined);
//     } catch (e) {
//       console.error("[LIFF] login failed:", e);
//     }
//   }

//   logout() {
//     if (!liffLib) return;
//     try {
//       liffLib.logout();
//       this.initialized = false;
//     } catch (e) {
//       console.error("[LIFF] logout failed:", e);
//     }
//   }

//   async getProfile(): Promise<LiffProfile | null> {
//     if (!this.isLoggedIn() || !liffLib) return null;
//     try {
//       const p = await liffLib.getProfile();
//       return { userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl };
//     } catch (e) {
//       console.error("[LIFF] getProfile failed:", e);
//       return null;
//     }
//   }

//   /** getIDToken() を隠蔽したラッパー（サーバ検証用に使用） */
//   async getIdToken(): Promise<string | null> {
//     try {
//       return liffLib?.getIDToken?.() ?? null;
//     } catch (e) {
//       console.error("[LIFF] getIDToken failed:", e);
//       return null;
//     }
//   }

//   getAccessToken(): string | null {
//     try {
//       return liffLib?.getAccessToken?.() ?? null;
//     } catch {
//       return null;
//     }
//   }

//   getDecodedIDToken(): any | null {
//     try {
//       return liffLib?.getDecodedIDToken?.() ?? null;
//     } catch {
//       return null;
//     }
//   }
// }

// // 使い回し用シングルトン
// export const liffManager = LiffManager.getInstance();
