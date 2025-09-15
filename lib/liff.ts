// lib/liff.ts

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

let liffLib: any | null = null;

const isBrowser = () => typeof window !== "undefined";
const LS_KEY = "app.liffId";
const VALID = /^\d{6,}-[A-Za-z0-9_-]+$/;

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

  /** 任意：手動で LIFF ID を保持させる */
  setLiffId(id: string | null) {
    const v = id && id.trim() ? id.trim() : null;
    this.currentLiffId = v;
    if (isBrowser()) {
      try {
        if (v) localStorage.setItem(LS_KEY, v);
        else localStorage.removeItem(LS_KEY);
      } catch { /* ignore */ }
    }
  }

  /** 便利ゲッター */
  getLiffId(): string | null {
    if (this.currentLiffId) return this.currentLiffId;
    if (isBrowser()) {
      try {
        const v = localStorage.getItem(LS_KEY);
        if (v && VALID.test(v)) return v;
      } catch { /* ignore */ }
    }
    return null;
  }

  private async importSdk() {
    if (!liffLib) {
      const mod = await import("@line/liff");
      liffLib = mod.default;
    }
  }

  /** URL から ?liff= または ?liffId= を拾う */
  private liffIdFromUrl(): string | null {
    if (!isBrowser()) return null;
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get("liff") || sp.get("liffId");
    if (s && VALID.test(s)) return s;
    return null;
  }

  /** サーバ保存の LIFF ID を取得（未認証なら 401→null） */
  private async liffIdFromServer(): Promise<string | null> {
    if (!isBrowser()) return null;
    try {
      const r = await fetch("/api/liff-settings", {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) return null; // 401 を含め握りつぶす
      const j = await r.json();
      const id = (j?.liffId && typeof j.liffId === "string") ? j.liffId : null;
      return id && VALID.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * 優先度:
   * 明示引数 > 既存保持値 > localStorage > URL(?liff|liffId) > env > /api/liff-settings
   * 　※ 初回はサーバが 401 になりがちなので最後に問い合わせる
   */
  async init(opts?: { liffId?: string }): Promise<boolean> {
    await this.importSdk();

    const fromArg = (opts?.liffId && VALID.test(opts.liffId)) ? opts.liffId.trim() : null;
    const fromHeld = this.currentLiffId && VALID.test(this.currentLiffId) ? this.currentLiffId : null;
    const fromLS = isBrowser() ? (() => {
      try { const v = localStorage.getItem(LS_KEY); return v && VALID.test(v) ? v : null; } catch { return null; }
    })() : null;
    const fromUrl = this.liffIdFromUrl();
    const fromEnv = (process.env.NEXT_PUBLIC_LIFF_ID && VALID.test(process.env.NEXT_PUBLIC_LIFF_ID))
      ? process.env.NEXT_PUBLIC_LIFF_ID!
      : "";

    const resolved =
      fromArg ||
      fromHeld ||
      fromLS ||
      fromUrl ||
      fromEnv ||
      (await this.liffIdFromServer());

    if (!resolved) {
      console.warn("[LIFF] liffId not found. Initialization skipped.");
      this.isInitialized = false;
      return false;
    }

    // すでに同じ ID で初期化済みならスキップ
    if (this.isInitialized && this.currentLiffId === resolved) return true;

    try {
      await liffLib.init({ liffId: resolved });

      this.isInitialized = true;
      this.setLiffId(resolved); // localStorage にも保存
      return true;
    } catch (e) {
      console.error("[LIFF] init failed:", e);
      this.isInitialized = false;
      return false;
    }
  }

  isLoggedIn(): boolean {
    try {
      // 厳密なLINE環境チェック - LINE外では絶対にfalse
      if (!this.isInLineEnvironment()) {
        return false;
      }
      return !!liffLib && !!liffLib.isLoggedIn?.();
    } catch {
      return false;
    }
  }

  /** 実際のLINE環境かどうかを判定（厳密チェック） */
  private isInLineEnvironment(): boolean {
    if (!isBrowser()) return false;
    if (!liffLib) return false;

    // LIFFの isInClient() のみを使用（最も厳密で信頼できる判定）
    return Boolean(liffLib?.isInClient?.());
  }

  /** 公開メソッド: LINEクライアント内かどうかをチェック */
  inClient(): boolean {
    return this.isInLineEnvironment();
  }

  /**
   * ログイン。redirectUri が未指定でも、現在の URL に liffId を付与して戻す。
   * これにより、ログイン復帰後も init に必要な LIFFID が失われません。
   */
  async login(opts?: { redirectUri?: string }): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Call init({ liffId }) before login().");
    }
    const id = this.getLiffId();
    // liff.login は戻り値は void だが await しても即 resolve
    if (!liffLib.isLoggedIn()) {
      const url = new URL((opts?.redirectUri || (isBrowser() ? window.location.href : "/")) as string, isBrowser() ? window.location.origin : undefined);
      if (id) {
        // 既存の liff/liffId を上書き保持
        url.searchParams.set("liffId", id);
      }
      await liffLib.login({ redirectUri: url.toString() });
    }
  }

  async logout(): Promise<void> {
    if (!liffLib) return;
    try { liffLib.logout(); } catch { /* ignore */ }
  }

  async getProfile(): Promise<LiffProfile | null> {
    if (!this.isInitialized) return null;

    // 実際のLINE環境でない場合はプロファイルを返さない
    if (!this.isInLineEnvironment()) {////add
      console.log("[LIFF] Not in LINE environment, profile access denied");
      return null;
    }

    try {
      const p = await liffLib.getProfile();
      if (!p) return null;
      return {
        userId: p.userId,
        displayName: p.displayName,
        pictureUrl: p.pictureUrl,
      };
    } catch (e) {
      console.warn("[LIFF] getProfile failed:", e);
      return null;
    }
  }

  /** IDトークン（未ログイン or 取得不可なら null） */
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
