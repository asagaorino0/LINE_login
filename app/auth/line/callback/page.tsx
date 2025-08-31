'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import liff from '@line/liff';

export default function LineCallback() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    (async () => {
      try {
        // 既にログイン完了していれば何もしない。必要なら liff.init 済みを前提に
        // if (!liff.isLoggedIn()) await liff.login({ redirectUri: window.location.href });

        // まず LIFF が付けてくれる liff.state を優先
        const liffState = sp.get('liff.state');
        const fromState = liffState ? decodeURIComponent(liffState) : null;

        // セッションに保存した returnTo をフォールバックに
        const fromSession = sessionStorage.getItem('returnTo');

        const target = fromState || fromSession || '/';
        router.replace(target);
      } catch {
        router.replace('/');
      }
    })();
  }, [router, sp]);

  return <p>ログイン処理中…</p>;
}
