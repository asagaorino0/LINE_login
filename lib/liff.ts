// lib/liff.ts
export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

type MinimalLiff = {
  init(input: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opt?: { redirectUri?: string }): void;
  logout(): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
};

let liffLib: MinimalLiff | null = null;

const LIFF_ID_KEY = "liffId";

export class LiffManager {
  private static instance: LiffManager;
  private initialized = false;
  private resolvedLiffId: string | null = null;
  private constructor() { }
  static getInstance(): LiffManager {
    if (!LiffManager.instance) LiffManager.instance = new LiffManager();
    return LiffManager.instance;
  }
  /** 現在使用中の LIFF ID を返す（未解決なら null） */
  getLiffId() {
    return this.resolvedLiffId;
  }
  /** 初期化（再入可だが多重初期化はスキップ） */
  async init(opts?: {
    /** まず /api/liff-settings を見に行く（デフォルト true） */
    preferServer?: boolean;
    /** 強制的にこの LIFF ID で起動（URL配布など） */
    liffIdOverride?: string;
  }): Promise<boolean> {
    if (this.initialized) return true;
    if (typeof window === "undefined") {
      // SSRでは常に未初期化のまま
      return false;
    }
    const preferServer = opts?.preferServer ?? true;
    let liffId: string | null = null;
    // 0) 明示指定があればそれを最優先
    if (opts?.liffIdOverride) {
      liffId = opts.liffIdOverride.trim();
      try {
        localStorage.setItem(LIFF_ID_KEY, liffId);
      } catch { }
    }
    // 1) サーバ保存を参照（uidクッキーがあるときのみ成功）
    if (!liffId && preferServer) {
      try {
        const r = await fetch("/api/liff-settings", { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          if (data?.hasLiffId && data?.liffId) {
            liffId = String(data.liffId);
            try {
              localStorage.setItem(LIFF_ID_KEY, liffId);
            } catch { }
          }
        }
      } catch (e) {
        console.warn("[LIFF] fetch /api/liff-settings failed:", e);
      }
    }
    // 2) URL ?lid=... を優先（初回ブート）
    if (!liffId) {
      try {
        const url = new URL(window.location.href);
        const fromQuery = url.searchParams.get("lid");
        if (fromQuery) {
          liffId = fromQuery;
          localStorage.setItem(LIFF_ID_KEY, fromQuery);
        }
      } catch { }
    }
    // 3) localStorage
    if (!liffId) {
      try {
        const saved = localStorage.getItem(LIFF_ID_KEY);
        if (saved) liffId = saved;
      } catch { }
    }
    // 4) 最後の手段として env
    if (!liffId) {
      // ENVゼロ運用想定: ここは無い想定。それでも拾えるように残す。
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? null;
    }
    if (!liffId) {
      console.warn("[LIFF] liffId not found. Initialization skipped.");
      this.initialized = false;
      this.resolvedLiffId = null;
      return false;
    }
    // SDK 読み込みは1回だけ
    if (!liffLib) {
      try {
        const mod = await import("@line/liff");
        liffLib = mod.default as MinimalLiff;
      } catch (e) {
        console.warn("[LIFF] failed to import SDK:", e);
        this.initialized = false;
        return false;
      }
    }
    try {
      await liffLib.init({ liffId });
      this.initialized = true;
      this.resolvedLiffId = liffId;
      return true;
    } catch (e) {
      console.warn("[LIFF] init failed:", e);
      this.initialized = false;
      this.resolvedLiffId = null;
      return false;
    }
  }
  /** すでにログインしているか（初期化済み前提） */
  isLoggedIn(): boolean {
    return !!(this.initialized && liffLib && liffLib.isLoggedIn());
  }
  /** ログイン必須の画面で使う：未ログインなら LINE ログインへ遷移 */
  ensureLogin(redirectUri?: string) {
    if (!this.initialized || !liffLib) {
      console.warn("[LIFF] ensureLogin called before init().");
      return;
    }
    if (!liffLib.isLoggedIn()) {
      liffLib.login(redirectUri ? { redirectUri } : undefined);
    }
  }
  /** 任意トリガーでログイン開始（遷移します） */
  login(redirectUri?: string) {
    if (!this.initialized || !liffLib) {
      console.warn("[LIFF] login called before init().");
      return;
    }
    liffLib.login(redirectUri ? { redirectUri } : undefined);
  }
  /** ログアウト（必要に応じて localStorage の LIFF ID は保持） */
  logout({ clearCachedLiffId = false }: { clearCachedLiffId?: boolean } = {}) {
    if (!this.initialized || !liffLib) {
      console.warn("[LIFF] logout called before init().");
      return;
    }
    try {
      liffLib.logout();
    } finally {
      if (clearCachedLiffId) {
        try {
          localStorage.removeItem(LIFF_ID_KEY);
        } catch { }
      }
    }
  }
  /** プロフィール取得（未初期化/未ログインなら null） */
  async getProfile(): Promise<LiffProfile | null> {
    if (!this.initialized || !liffLib || !liffLib.isLoggedIn()) return null;
    try {
      const p = await liffLib.getProfile();
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
}

// 使い方例
export const liffManager = LiffManager.getInstance();
