// app/lib/queryClient.ts
import { QueryClient, QueryFunction } from "@tanstack/react-query";

/** HTTP メソッド型 */
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** ブラウザ実行かどうか */
const isBrowser = typeof window !== "undefined";

/** ベースURL解決（Vite:3001 → Next API:3000 を考慮） */
function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, "");

  if (isBrowser) {
    const host = window.location.hostname;
    const port = window.location.port;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const isDev = process.env.NODE_ENV !== "production";

    if (isDev && isLocal) {
      if (port === "3001") return "http://localhost:3000"; // Vite→Next(API)
      if (port === "3000") return window.location.origin.replace(/\/+$/, "");
    }
    return window.location.origin.replace(/\/+$/, "");
  }
  // SSRなどで window がない場合のフォールバック
  return "";
}

export const API_BASE_URL = resolveBaseUrl();

/** 絶対URLに正規化 */
function joinUrl(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path; // すでに絶対URL
  if (!base) return path;
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

/** ステータス異常時に Error を投げる */
async function ensureOk(res: Response) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const text = await res.text();
      if (text) message = text;
    } catch { }
    const err = new Error(`${res.status}: ${message}`);
    (err as any).response = res;
    throw err;
  }
}

/**
 * 汎用 API 呼び出し
 * - 既存の挙動に合わせて Response を返す（後方互換）
 * - timeoutMs を指定可能
 */
export async function apiRequest(
  method: HttpMethod,
  url: string,
  data?: unknown,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const fullUrl = joinUrl(API_BASE_URL, url);
  console.log(`🌐 ${method} ${fullUrl}`);

  const controller = new AbortController();
  const timeoutId =
    init?.timeoutMs && init.timeoutMs > 0
      ? setTimeout(() => controller.abort(), init.timeoutMs)
      : undefined;

  try {
    const res = await fetch(fullUrl, {
      method,
      headers: data
        ? { "Content-Type": "application/json", ...(init?.headers || {}) }
        : init?.headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: init?.credentials ?? "include",
      signal: controller.signal,
      ...init,
    });
    await ensureOk(res);
    return res;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** 便利：JSON を直接返す版（必要に応じて使用） */
export async function apiJson<T>(
  method: HttpMethod,
  url: string,
  data?: unknown,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const res = await apiRequest(method, url, data, init);
  return (await res.json()) as T;
}

/** React Query 用の共通 QueryFn */
type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn =
  <T>({ on401 }: { on401: UnauthorizedBehavior }): QueryFunction<T> =>
    async ({ queryKey, signal }) => {
      const key = queryKey.join("/") as string;
      const fullUrl = joinUrl(API_BASE_URL, key);

      console.log(`🔍 GET ${fullUrl}`);

      // 401だけは throw 前に分岐したいので生 fetch
      const res = await fetch(fullUrl, { credentials: "include", signal });

      if (on401 === "returnNull" && res.status === 401) {
        return null as unknown as T;
      }

      await ensureOk(res);
      return (await res.json()) as T;
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchOnWindowFocus: false,
      refetchInterval: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: { retry: false },
  },
});
