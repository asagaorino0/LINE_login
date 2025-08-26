import { QueryClient, QueryFunction } from "@tanstack/react-query";

// 開発環境と本番環境のAPIベースURLを設定
function getApiBaseUrl(): string {
  // 開発環境の判定（ローカルホスト・127.0.0.1・Replit開発環境）
  if (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // ローカル開発の場合はポート3001を使用
    return window.location.port === '3001' ? 'http://localhost:3001' : 'http://localhost:5000';
  }
  // 本番環境では現在のオリジンを使用
  return window.location.origin;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // 相対URLの場合は適切なベースURLを追加
  const fullUrl = url.startsWith('/') ? `${getApiBaseUrl()}${url}` : url;

  console.log(`🌐 API Request: ${method} ${fullUrl}`);

  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const url = queryKey.join("/") as string;
      // 相対URLの場合は適切なベースURLを追加
      const fullUrl = url.startsWith('/') ? `${getApiBaseUrl()}${url}` : url;

      console.log(`🔍 Query Request: GET ${fullUrl}`);

      const res = await fetch(fullUrl, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
