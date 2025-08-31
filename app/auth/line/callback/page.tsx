// app/auth/line/callback/page.tsx
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import liff from '@line/liff';

// ✅ 事前レンダリングを無効化（動的ページとして扱う）
export const dynamic = 'force-dynamic';
// あるいは export const revalidate = 0; でもOK

function CallbackInner() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    (async () => {
      try {
        // 必要ならログイン保証：
        // if (!liff.isLoggedIn()) await liff.login({ redirectUri: window.location.href });

        // LIFF が付与する liff.state を優先
        const liffState = sp.get('liff.state');
        const fromState = liffState ? decodeURIComponent(liffState) : null;

        // セッションに保存した returnTo をフォールバックに
        const fromSession = typeof window !== 'undefined'
          ? sessionStorage.getItem('returnTo')
          : null;

        const target = fromState || fromSession || '/';
        router.replace(target);
      } catch {
        router.replace('/');
      }
    })();
  }, [router, sp]);

  return <p>ログイン処理中…</p>;
}

export default function LineCallback() {
  // ✅ useSearchParams() を使うコンポーネントを Suspense でラップ
  return (
    <Suspense fallback={<p>ログイン処理中…</p>}>
      <CallbackInner />
    </Suspense>
  );
}
