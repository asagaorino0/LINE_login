'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Copy, Pen } from 'lucide-react';
import { ToastNotification, useToastNotification } from '../components/ui/toast-notification';

import { apiRequest } from './lib/queryClient';
import { GoogleFormsManager } from './lib/googleForms';
import { liffManager, LiffProfile } from '@/lib/liff';
// import HomeClient from './(public)/HomeClient';
import LineSettingsClient from './line-settings/client';
import Howto from './line-settings/howto';

/* ------------------------------ Types & Const ------------------------------ */

// ★ 管理画面ではアカウント一覧を使わないため未使用
// type Account = {
//   basicId: string;
//   channelName?: string;
//   channelId?: string;
// };

type LiffSettingsResp = {
  success: boolean;
  hasLiffId: boolean;
  liffId?: string;
  error?: string;
};

const LIFF_ID_RE = /^\d{6,}-[A-Za-z0-9_-]+$/;

// URL末尾やクエリからフォールバックLIFF IDを取得

function getFallbackLiffId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('liff');
    if (fromQuery) return fromQuery;
    const pathParts = url.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && /^[0-9A-Za-z-]+$/.test(lastPart)) return lastPart;
  } catch { }
  return '';
}
/* ------------------------------ Zod Schemas -------------------------------- */

const liffIdSchema = z.object({
  liffId: z.string()
    .min(1, 'LIFF IDを入力してください')
    .regex(LIFF_ID_RE, '正しいLIFF IDフォーマットを入力してください'),
});

// type LiffIdFormData = z.infer<typeof liffIdSchema>;

/* ------------------------------ Utilities ---------------------------------- */

function ensureEntryFormat(s: string): string {
  const t = (s || '').trim();
  if (!t) return t;
  if (/^\d+$/.test(t)) return `entry.${t}`;
  if (!/^entry\./i.test(t)) {
    const num = t.match(/(\d{5,})/);
    if (num) return `entry.${num[1]}`;
  }
  return t;
}

// Googleフォームの formId を抽出（/forms/d/e/{FORM_ID}/）
const extractFormId = (url?: string) => {
  if (!url) return '';
  const m = url.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//);
  return m ? m[1] : '';
};

/* --------------------------------- Page ------------------------------------ */

export default function Home() {
  /* ---- routing / accounts ---- */
  const [pathname, setPathname] = useState<string>('');
  // const [accounts, setAccounts] = useState<Account[]>([]);
  // const [selectedBasicId, setSelectedBasicId] = useState<string>('');

  /* ---- app state ---- */
  const [isInitialized, setIsInitialized] = useState(false);
  // const [isLoggedIn, setIsLoggedIn] = useState(false);
  // const [userProfile, setUserProfile] = useState<LiffProfile | null>(null);

  const [formUrl, setFormUrl] = useState('');
  const [isTab, setIsTab] = useState<'top' | 'secret' | 'admin' | 'howto'>('admin');
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingUrl, setIsGeneratingUrl] = useState(false);
  // const [isSendingMessage, setIsSendingMessage] = useState(false);

  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('公式LINE連携_Googleフォーム');
  const [formDescription, setFormDescription] = useState('');
  const [formBgcolor, setFormBgcolor] = useState('#555555');
  // const [lineUserId, setLineUserId] = useState<string>('');
  const [signedLink, setSignedLink] = useState<string>('');
  // const [basicId, setBasicId] = useState<string>('');

  const [overrideUserEntry, setOverrideUserEntry] = useState<string>('');
  const [entryEditable, setEntryEditable] = useState<boolean>(false);

  const { toast, showToast, hideToast } = useToastNotification();
  // const didRunRef = useRef(false); // ★ 不使用
  // const [cookieInfo, setCookieInfo] = useState<{ hasUid: boolean; uidMasked?: string } | null>(null); // ★ 不使用
  // const [atherAccounts, setAtherAccounts] = useState(false);
  const [createdLid, setCreatedLid] = useState<string | null>(null);
  // 既存の state 群の近くに追加
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);

  // LIFF ID form
  const liffIdForm = useForm<LiffIdFormData>({
    resolver: zodResolver(liffIdSchema),
    defaultValues: {
      liffId: ""
    }
  });

  const queryClient = useQueryClient();

  /* ---- queries ---- */
  const liffSettingsQuery = useQuery<LiffSettingsResp>({
    queryKey: ['/api/liff-settings'],
    // queryFn: async () => {
    //   const response = await fetch('/api/liff-settings', {
    //     credentials: 'include',
    //     cache: 'no-store',
    //   });
    //   if (response.status === 401) {
    //     return { success: false, hasLiffId: false } as LiffSettingsResp;
    //   }
    //   if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    //   return (await response.json()) as LiffSettingsResp;
    // },
    queryFn: async () => {
      const response = await fetch('/api/liff-settings', {
        credentials: 'include',
        cache: 'no-store',
      });
      // 管理画面はログイン不要。401 のときは空データで扱う
      if (!response.ok) {
        return { success: false, hasLiffId: false } as LiffSettingsResp;
      }
      return (await response.json()) as LiffSettingsResp;
    },
    enabled: true, // ★ cookieInfo 依存を廃止（常に実行）
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const saveLiffIdMutation = useMutation({
    mutationFn: async (data: LiffIdFormData) => {
      const response = await fetch('/api/liff-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<{ success: boolean; message?: string; error?: string }>;
    },
    onSuccess: async (result) => {
      if (result.success) {
        showToast('LIFF IDが保存されました', 'success');
        await liffManager.init({ liffId: liffIdForm.getValues().liffId });
        queryClient.invalidateQueries({ queryKey: ['/api/liff-settings'] });
      } else {
        showToast(`保存エラー: ${result.error || '不明なエラー'}`, 'error');
      }
    },
    onError: (error: any) => {
      console.error('LIFF ID save error:', error);
      showToast(`保存エラー: ${error?.message || '不明なエラー'}`, 'error');
    },
  });

  /* ---- refs ---- */
  // const autoTriggeredRef = useRef(false); // ★ 不使用
  // const messageSentRef = useRef(false);   // ★ 不使用
  // const navigatedRef = useRef(false);     // ★ 不使用
  const linkCtxRef = useRef<{ lid?: string; aid?: string } | null>(null);
  const navigatedRef = useRef(false);
  // const [fingerprints, setFingerprints] = useState<{ liffId?: string; channelSecret?: string; channelAccessToken?: string } | null>(null); // ★ 不使用

  /* ------------------------------ Effects ---------------------------------- */
  // liffManager を使って LINE 内なら外部ブラウザで開く / それ以外は通常遷移
  function openUrl(url: string) {
    if (!url) return;
    try {
      if (typeof window !== 'undefined' && (liffManager as any)?.inClient?.()) {
        // 必要に応じて external: false にすると LINE 内WebViewで開きます
        (liffManager as any)?.openWindow
          ? (liffManager as any).openWindow({ url, external: true })
          : (window.location.href = url);
      } else {
        // 通常ブラウザ
        window.location.replace(url);
      }
    } catch {
      window.location.href = url;
    }
  }
  useEffect(() => {
    if (!isAutoMode || !formUrl || isGeneratingUrl) return;
    const url = generatedUrl || formUrl;
    if (!url) return;
    if (navigatedRef.current) return; // 二重遷移防止
    navigatedRef.current = true;
    openUrl(url);
  }, [isAutoMode, formUrl, generatedUrl, isGeneratingUrl]);

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  // LIFF 初期化（URL / フォーム / サーバ設定 / ENV / フォールバックの優先順）
  function getSearchParams(): URLSearchParams {
    if (typeof window === 'undefined') return new URLSearchParams('');
    return new URLSearchParams(window.location.search ?? '');
  }

  const resolveLiffId = (): string | undefined => {
    const sp = getSearchParams();
    const fromUrl = sp.get('liff') || sp.get('liffId') || undefined;
    const fromForm = liffIdForm.getValues?.().liffId?.trim() || undefined;
    const fromServer = liffSettingsQuery.data?.liffId?.trim() || undefined;
    const fromEnv = process.env.NEXT_PUBLIC_LIFF_ID || undefined;
    const fallback = getFallbackLiffId();
    return fromForm || fromUrl || fromServer || fromEnv || fallback;
  };

  const ensureLiffReady = async (): Promise<boolean> => {
    const id = resolveLiffId();
    // ★ init はログインを誘発しないため残す
    return await liffManager.init({ liffId: id });
  };

  // 初回起動
  useEffect(() => {
    (async () => {
      try {
        await ensureLiffReady();
        setIsInitialized(true);

        // ★ 管理画面はログインしない
        // const inClient = liffManager.inClient();
        // if (liffManager.isLoggedIn()) {
        //   const profile = await liffManager.getProfile();
        //   if (profile) {
        //     setUserProfile(profile);
        //     setIsLoggedIn(true);
        //     if (inClient) setLineUserId(profile.userId);
        //     await apiRequest('POST', '/api/line-users', { ... });
        //   }
        // }

        // 画面状態を復元（ログイン前提でなくても問題ない部分だけ維持）
        try {
          const sp = new URLSearchParams(location.search);
          const tabFromUrl = (sp.get('tab') || '').toLowerCase();
          const returnTab = sessionStorage.getItem('returnTab');
          const savedState = sessionStorage.getItem('appState');
          if (savedState) {
            const parsed = JSON.parse(savedState);
            if (tabFromUrl === 'admin' || returnTab === 'admin') {
              parsed.isTab = 'admin';
              parsed.isAdmin = true;
            }
            setIsTab(parsed.isTab);
            setIsAdmin(parsed.isAdmin);
            setIsAutoMode(parsed.isAutoMode);
            sessionStorage.removeItem('appState');
          }
        } catch (error) {
          console.error('🔄 [RESTORE] Failed to restore app state:', error);
        }

        // ★ 自動 LIFF 保存はログイン前提のためコメントアウト
        // const sp = new URLSearchParams(location.search);
        // const liffIdFromUrl = sp.get('liff') || sp.get('liffId');
        // if (liffIdFromUrl && (liffSettingsQuery.isSuccess && !liffSettingsQuery.data?.hasLiffId)) {
        //   try {
        //     await apiRequest('POST', '/api/liff-settings', { liffId: liffIdFromUrl });
        //     queryClient.invalidateQueries({ queryKey: ['/api/liff-settings'] });
        //   } catch (error) {
        //     console.error('Failed to auto-save LIFF ID:', error);
        //   }
        // }
      } catch (e) {
        console.error('LIFF initialization failed:', e);
        setError('LIFF初期化に失敗しました。ページをリロードしてください。');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [/* liffSettingsQuery.data?.liffId */]); // ★ cookieInfo 依存削除

  // ★ whoami は使わない（ログイン不要）
  // useEffect(() => {
  //   fetch('/api/whoami', { credentials: 'include', cache: 'no-store' })
  //     .then((r) => r.json())
  //     .then((j) => setCookieInfo(j))
  //     .catch(() => setCookieInfo(null));
  // }, [isLoggedIn, isAdmin]);

  // ★ whoami が未ログインならUIDクリア…も不要
  // useEffect(() => {
  //   if (!cookieInfo?.hasUid) setLineUserId('');
  // }, [cookieInfo?.hasUid]);

  // URLパラメータまたはサーバー設定からLIFF IDをフォームに自動入力
  useEffect(() => {
    // const sp = new URLSearchParams(window.location.search);
    // const liffIdFromUrl = sp.get('liff') || sp.get('liffId');
    const liffIdFromUrl = (() => {
      if (typeof window === 'undefined') return '';
      const sp = new URLSearchParams(window.location.search ?? '');
      return sp.get('liff') || sp.get('liffId') || '';
    })();

    if (liffIdFromUrl) {
      liffIdForm.setValue('liffId', liffIdFromUrl);
    } else if (liffSettingsQuery.data?.success && liffSettingsQuery.data.liffId) {
      liffIdForm.setValue('liffId', liffSettingsQuery.data.liffId);
    }
  }, [liffSettingsQuery.data, liffIdForm]);

  // ★ secrets 指紋（存在確認）は管理画面では不要
  // useEffect(() => {
  //   (async () => {
  //     try {
  //       const r = await fetch('/api/line-secrets', { cache: 'no-store' });
  //       if (r.ok) {
  //         const j = await r.json();
  //         if (j?.exists) setFingerprints(j.fingerprints ?? null);
  //       }
  //     } catch {/* noop */ }
  //   })();
  // }, []);

  // ★ 管理者 cookie 設定は不要
  // const firedAdminLoginRef = useRef(false);
  // const setAdminCookie = useMutation<
  //   void,
  //   Error,
  //   { lineUserId: string; displayName?: string; pictureUrl?: string | null }
  // >({
  //   mutationFn: async (vars) => { await apiRequest('POST', '/api/line-admin', vars); },
  //   onSuccess: () => {
  //     sessionStorage.setItem('adminReady', '1');
  //     setAdminReady(true);
  //   },
  // });
  // useEffect(() => {
  //   if (!userProfile?.userId) return;
  //   if (firedAdminLoginRef.current) return;
  //   firedAdminLoginRef.current = true;
  //   if (!setAdminCookie.isPending) {
  //     setAdminCookie.mutate({
  //       lineUserId: userProfile.userId,
  //       displayName: userProfile.displayName,
  //       pictureUrl: userProfile.pictureUrl ?? null,
  //     });
  //   }
  // }, [userProfile?.userId, setAdminCookie]);

  // ★ アカウント一覧の読み込みはログイン前提のため停止
  // useEffect(() => {
  //   if (isTab === 'top' /*|| !adminReady*/) {
  //     setAccounts([]);
  //     setSelectedBasicId('');
  //     return;
  //   }
  //   let aborted = false;
  //   (async () => {
  //     try {
  //       const r = await fetch('/api/line-secrets?mine=1', { credentials: 'include' });
  //       if (aborted) return;
  //       if (r.status === 401) { setAccounts([]); setSelectedBasicId(''); return; }
  //       const j = await r.json();
  //       const raw = Array.isArray(j?.items) ? j.items : [];
  //       const normalized: Account[] = raw
  //         .map((a: any): Account => ({
  //           basicId: typeof a?.basicId === 'string' ? a.basicId : '',
  //           channelName: typeof a?.channelName === 'string' ? a.channelName : undefined,
  //           channelId: typeof a?.channelId === 'string' ? a.channelId : undefined,
  //         }))
  //         .filter((a: { basicId: string }) => a.basicId !== '');
  //       setAccounts(normalized);
  //       setBasicId(normalized[0]?.basicId ?? '');
  //       setSelectedBasicId((prev) => prev || (normalized[0]?.basicId ?? ''));
  //     } catch {
  //       if (!aborted) { setAccounts([]); setSelectedBasicId(''); }
  //     }
  //   })();
  //   return () => { aborted = true; };
  // }, [isTab /*, adminReady*/]);

  // URL パラメータ→状態
  useEffect(() => {
    if (pathname === '/open') return;
    const sp = new URLSearchParams(window.location.search);
    const lid = sp.get('lid');
    const formParam = sp.get('form');
    const tabParam = (sp.get('tab') || '').toLowerCase();
    const entryParam = sp.get('entry');

    if (entryParam) setOverrideUserEntry(ensureEntryFormat(entryParam));

    if (lid) {
      setCreatedLid(lid);
      setIsAutoMode(true);
      (async () => {
        const r = await fetch(`/api/links/${lid}`);
        const j = await r.json();
        if (r.ok && j?.ok) {
          linkCtxRef.current = { lid, aid: j.aid };
          setFormUrl(j.formUrl);
          if (j.title) setFormTitle(j.title);
          if (j.desc) setFormDescription(j.desc);
          if (j.bgcolor) setFormBgcolor(j.bgcolor);
          if (j.entry) setOverrideUserEntry(ensureEntryFormat(String(j.entry)));
        } else {
          showToast('リンクが無効または期限切れです', 'error');
        }
      })();
    } else if (formParam) {
      setFormUrl(decodeURIComponent(formParam));
      setIsAutoMode(true);
    }
    if (tabParam === 'admin') {
      setIsAdmin(true);
      setIsTab('admin');
      sp.delete('tab');
      const qs = sp.toString();
      const clean = `${location.pathname}${qs ? '?' + qs : ''}${location.hash}`;
      window.history.replaceState(null, '', clean);
    }
  }, [pathname, showToast]);

  // ★ whoami に依存したタブ復帰は不要
  // useEffect(() => {
  //   if (pathname === '/open') return;
  //   const wantNotify = sessionStorage.getItem('notifyAfterLogin');
  //   const returnTab = sessionStorage.getItem('returnTab');
  //   if (cookieInfo?.hasUid) {
  //     if (wantNotify === '1') {
  //       sessionStorage.removeItem('notifyAfterLogin');
  //     }
  //     if (returnTab === 'admin') {
  //       setIsAdmin(true);
  //       setIsTab('admin');
  //       sessionStorage.removeItem('returnTab');
  //     }
  //   }
  // }, [cookieInfo?.hasUid, pathname]);

  // タイトル同期
  useEffect(() => {
    if (formTitle) document.title = formTitle;
  }, [formTitle]);

  // URL 正規化（detectは使わない）
  const viewUrlNormalized = useMemo(() => {
    try {
      return (GoogleFormsManager as any).normalizeFormUrl
        ? (GoogleFormsManager as any).normalizeFormUrl(formUrl)
        : formUrl;
    } catch {
      return formUrl;
    }
  }, [formUrl]);

  /* ---------- CosmosDB: ENTRY の自動読込 & 保存 ---------- */

  const liffIdForEntry = resolveLiffId() || '';
  const formIdForEntry = extractFormId(viewUrlNormalized);
  const canLoadEntry = !!liffIdForEntry && !!formIdForEntry;

  const entryQuery = useQuery({
    queryKey: ['/api/entry-mappings', liffIdForEntry, formIdForEntry],
    enabled: canLoadEntry && isTab === 'admin',
    queryFn: async () => {
      const r = await fetch(
        `/api/entry-mappings?liffId=${encodeURIComponent(liffIdForEntry)}&formId=${encodeURIComponent(formIdForEntry)}`,
        { credentials: 'include' }
      );
      if (r.status === 404) return { entry: '' };
      if (!r.ok) throw new Error(`entry load failed: ${r.status}`);
      return r.json() as Promise<{ entry: string }>;
    },
  });

  useEffect(() => {
    // 手入力が既にある場合は上書きしない
    if (!overrideUserEntry && entryQuery.data?.entry) {
      setOverrideUserEntry(ensureEntryFormat(entryQuery.data.entry));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryQuery.data?.entry]);

  const queryClientLocal = useQueryClient();
  const saveEntryMutation = useMutation({
    mutationFn: async (entry: string) => {
      const body = {
        liffId: liffIdForEntry,
        formId: formIdForEntry,
        formUrl: viewUrlNormalized,
        entry: ensureEntryFormat(entry),
      };
      const r = await fetch('/api/entry-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`entry save failed: ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      showToast('ENTRY を保存しました', 'success');
      setEntryEditable(false);
      queryClientLocal.invalidateQueries({ queryKey: ['/api/entry-mappings', liffIdForEntry, formIdForEntry] });
    },
    onError: (e: any) => showToast(`保存に失敗: ${e?.message || 'unknown'}`, 'error'),
  });

  /* ---------- Prefill URL 生成（保存/手入力 ENTRY のみ使用） ---------- */

  const generatePrefillUrl = async (originalUrl: string, userId: string): Promise<string> => {
    try {
      const baseUrl = originalUrl.split('?')[0];
      const userIdEntry = overrideUserEntry.trim()
        ? ensureEntryFormat(overrideUserEntry)
        : (entryQuery.data?.entry ? ensureEntryFormat(entryQuery.data.entry) : '');

      if (!userIdEntry) {
        throw new Error('このフォームでは自動UID連携に対応していません。手動でentry IDを指定してください。');
      }

      const params = new URLSearchParams();
      if (userId) {
        params.set('usp', 'pp_url');
        params.set(userIdEntry, userId);
        return `${baseUrl}?${params.toString()}`;
      }
      return baseUrl;
    } catch (e) {
      console.error('Failed to generate prefill URL:', e);
      return originalUrl;
    }
  };

  // Auto mode: URL生成
  useEffect(() => {
    (async () => {
      if (formUrl && isAutoMode) {
        // if (!userProfile) {// ★ ログインしないので UID 自動付与はスキップ
        //   setGeneratedUrl(null);
        //   setIsGeneratingUrl(false);
        //   return;
        // }
        setIsGeneratingUrl(true);
        try {
          // const uid = userProfile?.userId || '';// UIDを自動で付与しないケースは、そのままのURLを表示
          const url = await generatePrefillUrl(formUrl,  /* userId */ '');
          setGeneratedUrl(url);
        } catch (e) {
          console.error('URL generation failed:', e);
          setGeneratedUrl(null);
        } finally {
          setIsGeneratingUrl(false);
        }
      } else {
        setGeneratedUrl(null);
        setIsGeneratingUrl(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [/* userProfile?.userId, */ formUrl, isAutoMode, overrideUserEntry]);

  /* ---------- リンク生成（/api/links） ---------- */

  const handleGenerateLink = async () => {
    if (!formUrl.trim()) {
      showToast('フォームURLを先に入力してください', 'error');
      return;
    }

    setSignedLink('');

    try {
      const normalized = viewUrlNormalized;
      const payload: Record<string, any> = {
        form: normalized,
        title: String(formTitle ?? ''),
        desc: String(formDescription ?? ''),
        notify: 0,               // 通知はここでは使わない
        bgcolor: formBgcolor || '#555555',
      };

      if (overrideUserEntry.trim()) {
        payload.entry = ensureEntryFormat(overrideUserEntry);
      }

      const currentLiffId = resolveLiffId();
      if (currentLiffId && LIFF_ID_RE.test(currentLiffId)) {
        payload.liffId = currentLiffId;
      }

      const r = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const t = await r.text();
      let j: any = null;
      try { j = t ? JSON.parse(t) : null; } catch { /* noop */ }
      if (!r.ok || !j?.ok) {
        const code = j?.code || 'UNKNOWN';
        console.error('links-create error:', { status: r.status, code, detail: j ?? t });
        const msgMap: Record<string, string> = {
          // NO_ADMIN_ID: '（ログイン情報が無効です）', // ★ 管理画面はログイン不要
          BAD_FORM_URL: 'フォームURLが正しくありません。',
          NO_FORM: 'フォームURLを入力してください。',
          NO_BASIC_ID: '通知ON時は公式LINE（basicId）が必須です。',
        };
        showToast(msgMap[code] || `エラー: ${code}（${r.status}）`, 'error');
        return;
      }

      const u = new URL(j.link, window.location.origin);
      if (overrideUserEntry.trim()) u.searchParams.set('entry', ensureEntryFormat(overrideUserEntry));
      if (currentLiffId && LIFF_ID_RE.test(currentLiffId)) u.searchParams.set('liff', currentLiffId);
      const enhancedLink = u.toString();

      setSignedLink(enhancedLink);
      if (j.lid) setCreatedLid(j.lid);
      showToast('連携リンクを生成しました', 'success');
    } catch (e) {
      console.error('generate link failed:', e);
      showToast('連携リンク生成でエラーが発生しました', 'error');
    }
  };

  /* ---- プレビューURL（通知UIは使わないがプレビューは残す） ---- */
  // const previewUrl = useMemo(() => {
  //   if (!viewUrlNormalized) return '';
  //   const origin = getOrigin();
  //   if (!origin) return ''; // SSR/ビルド中は空を返す
  //   const params = new URLSearchParams({
  //     form: viewUrlNormalized,
  //     title: formTitle || '',
  //     desc: formDescription || '※こちらご対応頂くことで弊社からご連絡することが可能になります。必ずご回答ください。',
  //     notify: '0',
  //     v: String(Date.now()),
  //   });
  //   return `${origin}/api/link-preview?${params.toString()}`;
  // }, [viewUrlNormalized, formTitle, formDescription]);


  /* --------------------------------- UI ------------------------------------ */

  if (pathname === '/open') return null;

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-line-green mx-auto mb-4" />
          <p className="text-gray-600">アプリを初期化中...</p>
        </div>
      </div>
    );
  }

  const liffIdFromUrl = (() => {
    if (typeof window === 'undefined') return '';
    const sp = new URLSearchParams(window.location.search ?? '');
    return sp.get('liff') || sp.get('liffId') || '';
  })();

  const liffIdFromForm = liffIdForm.watch('liffId');
  const hasLiffId = liffIdFromUrl || liffIdFromForm || liffSettingsQuery.data?.liffId || getFallbackLiffId();

  const currentLiffId = String(
    liffIdFromUrl || liffIdFromForm || liffSettingsQuery.data?.liffId || getFallbackLiffId() || ''
  );

  type LiffIdFormData = { liffId: string };

  const onLiffIdSubmit: SubmitHandler<LiffIdFormData> = (data) => {
    saveLiffIdMutation.mutate(data);
  };

  // 例：page.tsx 内の補助関数（必要時のみ使用）
  async function loadEntryMapping(liffId: string, formUrl: string) {
    const u = new URL("/api/entry-mappings", window.location.origin);
    u.searchParams.set("liffId", liffId);
    u.searchParams.set("formUrl", formUrl);
    const r = await fetch(u.toString(), { credentials: "include" });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data as { entry: string; formId: string } | null;
  }

  return (
    <>
      {/* <HomeClient /> */}
      <div className="bg-gray-50 font-noto min-h-screen">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-md mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-gray-900">Googleフォーム-LINE連携システム</h1>
              <div className="text-sm text-gray-500">v1.0</div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full px-4 pb-4 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl">
          {formUrl && isAutoMode && (
            isGeneratingUrl ? (
              <div className="text-center">
                <h3 className="text-base font-semibold">
                  <span className="text-blue-600">フォームへ移動中...</span>
                </h3>
              </div>
            ) : (
              <div className="text-center">
                <h3 className="text-base font-semibold">
                  <span className="text-blue-600">フォームに移動します…</span>
                </h3>
                <p className="text-sm mt-2">
                  自動で開かない場合は
                  {' '}
                  <a
                    href={(generatedUrl || formUrl) ?? '#'}
                    className="text-blue-600 underline"
                  >
                    こちらをタップ
                  </a>
                </p>
              </div>
            )
          )}

          {!isAutoMode && isTab !== 'secret' && isTab !== 'howto' && (
            <>
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">管理者モード</h3>
                  </div>

                  {isTab === 'admin' && (
                    <div className="space-y-4">
                      {/* LIFF ID 設定 */}
                      <div className="p-3 bg-blue-50 rounded-lg mb-4">
                        <h5 className="text-sm font-semibold text-gray-800 mb-1">LIFF ID設定</h5>
                        <p className="text-sm text-gray-700 mb-1">LINE連携に必要なLIFF IDを設定してください</p>
                        <button onClick={() => { setIsTab('top'); setIsAdmin(false); }}>
                          <h5 className="text-sm text-amber-800 mb-2">（Googleフォーム側の重要な設定 はこちら）</h5>
                        </button>

                        <p className="text-sm text-gray-600">
                          <a href="https://developers.line.biz/console/" target="blank" style={{ color: 'blue' }}>
                            LINE Developers Console
                          </a> にログイン
                        </p>
                        <Form {...liffIdForm}>
                          <form onSubmit={liffIdForm.handleSubmit(onLiffIdSubmit)}>
                            <FormField
                              control={liffIdForm.control}
                              name="liffId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs font-medium text-gray-700">LIFF ID</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="例: 1234567890-abcdefgh"
                                      className="text-sm"
                                      data-testid="input-liff-id"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </form>
                        </Form>
                      </div>

                      {hasLiffId && (
                        <>
                          <div>
                            {/* GoogleフォームURL */}
                            <Input
                              type="url"
                              value={formUrl}
                              onChange={(e) => {
                                setFormUrl(e.target.value);
                                setSignedLink('');
                              }}
                              placeholder="ここにGoogleフォームのURLを入力"
                              className="pr-5 text-gray-500 text-sm bg-blue-200"
                            />

                            {/* ENTRY 編集（Cosmos保存） */}
                            {formUrl ? (
                              <div className="mt-3 p-3 rounded border bg-white">
                                <div className="text-xs text-gray-700 mb-2 font-semibold">ENTRY ID</div>

                                <div className="flex gap-2 items-center">
                                  <Input
                                    value={overrideUserEntry}
                                    onChange={(e) => setOverrideUserEntry(e.target.value)}
                                    placeholder="例）entry.123456789 または 123456789"
                                    className="text-xs"
                                  />
                                  {/* 読み込みボタン（DB → state） */}
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="text-xs"
                                    disabled={isLoadingEntry || !currentLiffId || !formUrl}
                                    onClick={async () => {
                                      if (!currentLiffId || !formUrl) return;
                                      setIsLoadingEntry(true);
                                      try {
                                        const m = await loadEntryMapping(currentLiffId, formUrl);
                                        if (m?.entry) {
                                          setOverrideUserEntry(m.entry); // 既存 entry を反映
                                          showToast('ENTRY を読み込みました', 'success');
                                        } else {
                                          showToast('保存済みの ENTRY は見つかりません', 'error');
                                        }
                                      } catch (e) {
                                        console.error('loadEntryMapping failed:', e);
                                        showToast('読み込みに失敗しました', 'error');
                                      } finally {
                                        setIsLoadingEntry(false);
                                      }
                                    }}
                                  >
                                    {isLoadingEntry ? '読み込み中...' : '読み込み'}
                                  </Button>

                                  <Button
                                    type="button"
                                    size="sm"
                                    className="text-xs"
                                    disabled={!overrideUserEntry || saveEntryMutation.isPending || !canLoadEntry}
                                    onClick={() => saveEntryMutation.mutate(overrideUserEntry)}
                                  >
                                    {saveEntryMutation.isPending ? '保存中...' : '保存'}
                                  </Button>
                                </div>
                                <div className="text-[11px] text-gray-500 mt-2">
                                  ※ 「読み込み」は保存済みの ENTRY を取得して反映します。<br />
                                  ※ LIFF ID と フォームURL（またはフォームID）がキーです。
                                </div>
                              </div>
                            ) : null}

                            {/* 連携リンク生成 */}
                            {formUrl && (
                              <Button
                                onClick={handleGenerateLink}
                                variant={formUrl ? 'default' : 'outline'}
                                size="sm"
                                className="mt-2 w-full text-white border-blue-300 hover:bg-blue-500 mb-2"
                              >
                                ✨ 連携リンクを生成
                              </Button>
                            )}
                          </div>
                        </>
                      )}

                      {/* 生成結果 */}
                      <div className="space-y-3">
                        {signedLink && (
                          <>
                            <div className="p-4 bg-blue-100 rounded-lg border">
                              <h4 className="text-xs text-gray-800 mb-2">
                                連携リンクを生成しました。以下のリンクを <strong>GoogleフォームURL</strong>としてご利用ください。
                              </h4>
                              <div className="bg-white rounded border p-3 mb-3">
                                <code className="text-xs font-mono text-gray-800 break-all">
                                  {signedLink || '・・・'}
                                </code>
                              </div>
                            </div>
                            <Button
                              onClick={async () => {
                                if (!signedLink) return;
                                try {
                                  await navigator.clipboard.writeText(signedLink);
                                  showToast('リンクをコピーしました', 'success');
                                } catch {
                                  showToast('コピーに失敗しました', 'error');
                                }
                              }}
                              variant={signedLink ? 'default' : 'outline'}
                              size="sm"
                              className="mt-2 w-full text-white border-blue-300 hover:bg-blue-500 mb-2"
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              リンクをコピー
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {isTab === 'top' && (
                    <>
                      <div className="p-3 bg-amber-50 rounded-lg mb-4">
                        <h5 className="text-sm font-semibold text-gray-800 mb-1">Googleフォーム側の重要な設定</h5>
                        <p className="text-sm text-gray-700 mb-2">
                          ⚠️LINEとの連携には、<strong style={{ color: 'red' }}>必ず次の設定をしてください</strong>
                        </p>
                        <div className="rounded border p-2 mb-2">
                          <p className="text-sm text-gray-600">
                            <strong>＜設定手順＞</strong><br />
                            1. 質問１のタイトル: 「LINE User ID」<br />
                            2. 質問１の回答形式: 記述式（短文）<br />
                            3. 説問１の必須: ON（上部メールアドレス設定は任意）
                          </p>
                        </div>
                      </div>

                      <Button
                        onClick={() => { setIsAdmin(true); setIsTab('admin'); }}
                        variant="default"
                        size="sm"
                        className="w-full mt-2 text-green-700 border-blue-300 hover:bg-blue-700 text-white"
                        data-testid="button-start-admin"
                      >
                        <span>準備完了！　はじめる</span>
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {isTab === 'secret' && (
            <LineSettingsClient onClick={() => { setIsTab('admin'); setIsAdmin(true); }} formUrl={formUrl} />
          )}
          {isTab === 'howto' && (
            <Howto onClick={() => { setIsTab('admin'); setIsAdmin(true); }} />
          )}

          {/* ページャ */}
          <div className="flex flex-row justify-center m-4">
            <div className="px-2">
              {isTab === 'top'
                ? <button className="rounded-full h-5 w-5 bg-primary" />
                : <button onClick={() => { setIsTab('top'); setIsAdmin(false); }}>
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                </button>}
            </div>
            <div className="px-2">
              {isTab === 'admin'
                ? <button className="rounded-full h-5 w-5 bg-primary" />
                : <button onClick={() => { setIsTab('admin'); setIsAdmin(true); }}>
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                </button>}
            </div>
            <div className="px-2">
              {isTab === 'secret'
                ? <button className="rounded-full h-5 w-5 bg-primary" />
                : <button onClick={() => { setIsTab('secret'); setIsAdmin(false); }}>
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                </button>}
            </div>
            <div className="px-2">
              {isTab === 'howto'
                ? <button className="rounded-full h-5 w-5 bg-primary" />
                : <button onClick={() => { setIsTab('howto'); setIsAdmin(false); }}>
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                </button>}
            </div>
          </div>
        </main>

        <footer className="max-w-md mx-auto px-4 py-6 text-center">
          <div className="text-xs text-gray-500 space-y-2">
            <p>© 2025 LINE UID Collection System by konoyubi</p>
          </div>
        </footer>

        <ToastNotification
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />
      </div>
    </>
  );
}
