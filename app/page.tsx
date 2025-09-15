'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Copy } from 'lucide-react';
import { ToastNotification, useToastNotification } from '../components/ui/toast-notification';

import { apiRequest } from './lib/queryClient';
import { GoogleFormsManager } from './lib/googleForms';
import { liffManager, LiffProfile } from '@/lib/liff';
import HomeClient from './(public)/HomeClient';
import LineSettingsClient from './line-settings/client';
import Howto from './line-settings/howto';

/* ------------------------------ Types & Const ------------------------------ */

type Account = {
  basicId: string;
  channelName?: string;
  channelId?: string;
};

type LiffSettingsResp = {
  success: boolean;
  hasLiffId: boolean;
  liffId?: string;
  error?: string;
};

const LIFF_ID_RE = /^\d{6,}-[A-Za-z0-9_-]+$/;

/* ------------------------------ Zod Schemas -------------------------------- */

const liffIdSchema = z.object({
  liffId: z.string()
    .min(1, 'LIFF IDを入力してください')
    .regex(LIFF_ID_RE, '正しいLIFF IDフォーマットを入力してください'),
});

type LiffIdFormData = z.infer<typeof liffIdSchema>;

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

/* --------------------------------- Page ------------------------------------ */

export default function Home() {
  /* ---- routing / accounts ---- */
  const [pathname, setPathname] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBasicId, setSelectedBasicId] = useState<string>('');

  /* ---- app state ---- */
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<LiffProfile | null>(null);

  const [formUrl, setFormUrl] = useState('');
  const [isTab, setIsTab] = useState<'top' | 'secret' | 'admin' | 'howto'>('top');
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isGeneratingUrl, setIsGeneratingUrl] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const [detectedEntries, setDetectedEntries] = useState<{ userId?: string } | null>(null);
  const [lastDetectionResult, setLastDetectionResult] = useState<{ userId: string; formUrl: string } | null>(null);

  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('公式LINE連携_Googleフォーム');
  const [formDescription, setFormDescription] = useState('リンクを開くにはこちらをタップ');
  const [formBgcolor, setFormBgcolor] = useState('#555555');
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [lineUserId, setLineUserId] = useState<string>("");
  const [signedLink, setSignedLink] = useState<string>("");
  const [basicId, setBasicId] = useState<string>("");

  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [overrideUserEntry, setOverrideUserEntry] = useState<string>("");

  const { toast, showToast, hideToast } = useToastNotification();

  const [cookieInfo, setCookieInfo] = useState<{ hasUid: boolean; uidMasked?: string } | null>(null);

  // LIFF ID form setup
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
    queryFn: async () => {
      const response = await fetch('/api/liff-settings', {
        credentials: 'include',
        cache: 'no-store'
      });
      if (response.status === 401) {
        return { success: false, hasLiffId: false } as LiffSettingsResp;
      }
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`
        )
      return (await response.json()) as LiffSettingsResp;
    },
    enabled: cookieInfo?.hasUid === true,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  const saveLiffIdMutation = useMutation({
    mutationFn: async (data: LiffIdFormData) => {
      const response = await fetch('/api/liff-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
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
    }
  });

  /* ---- refs ---- */

  const autoTriggeredRef = useRef(false);
  const messageSentRef = useRef(false);
  const navigatedRef = useRef(false);
  const linkCtxRef = useRef<{ lid?: string; aid?: string } | null>(null);

  const [fingerprints, setFingerprints] = useState<{ liffId?: string; channelSecret?: string; channelAccessToken?: string } | null>(null);

  /* ------------------------------ Effects ---------------------------------- */

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  // LIFF 初期化（URL / フォーム / サーバ設定 / ENV の優先順で）
  const ensureLiffReady = async (): Promise<boolean> => {
    const sp = new URLSearchParams(location.search);
    const fromUrl = sp.get("liff") || sp.get("liffId") || undefined;
    const fromForm = liffIdForm.getValues?.().liffId?.trim() || undefined;
    const fromServer = liffSettingsQuery.data?.liffId?.trim() || undefined;
    const fromEnv = process.env.NEXT_PUBLIC_LIFF_ID || undefined;
    return await liffManager.init({ liffId: fromForm || fromUrl || fromServer || fromEnv });
  };

  // 初回起動
  useEffect(() => {
    (async () => {
      try {
        await ensureLiffReady();
        setIsInitialized(true);
        if (liffManager.isLoggedIn()) {
          const profile = await liffManager.getProfile();
          if (profile) {
            setUserProfile(profile);
            setIsLoggedIn(true);
            await apiRequest('POST', '/api/line-users', {
              lineUserId: profile.userId,
              displayName: profile.displayName,
              pictureUrl: profile.pictureUrl || null,
            });
            // ログイン後に保存された画面状態を復元
            try {
              console.log('🔄 [RESTORE] Checking sessionStorage for app state...');
              console.log('🔄 [RESTORE] Current sessionStorage contents:', {
                returnTo: sessionStorage.getItem('returnTo'),
                appState: sessionStorage.getItem('appState')
              });
              const savedState = sessionStorage.getItem('appState');
              if (savedState) {
                const parsed = JSON.parse(savedState);
                console.log('🔄 [RESTORE] Parsed app state:', parsed);
                const { isTab: savedTab, isAdmin: savedAdmin, isAutoMode: savedAutoMode } = parsed;
                console.log('🔄 [RESTORE] Restoring state:', {
                  isTab: `${isTab} → ${savedTab}`,
                  isAdmin: `${isAdmin} → ${savedAdmin}`,
                  isAutoMode: `${isAutoMode} → ${savedAutoMode}`
                });
                setIsTab(savedTab);
                setIsAdmin(savedAdmin);
                setIsAutoMode(savedAutoMode);
                sessionStorage.removeItem('appState'); // 復元後は削除
                console.log('🔄 [RESTORE] State restoration completed');
              } else {
                console.log('🔄 [RESTORE] No saved state found in sessionStorage');
              }
            } catch (error) {
              console.error('🔄 [RESTORE] Failed to restore app state:', error);
            }
            // 初回ログイン時にLIFF IDを自動保存
            const sp = new URLSearchParams(location.search);
            const liffIdFromUrl = sp.get("liff") || sp.get("liffId");
            if (liffIdFromUrl && (liffSettingsQuery.isSuccess && !liffSettingsQuery.data?.hasLiffId)) {
              try {
                await apiRequest('POST', '/api/liff-settings', { liffId: liffIdFromUrl });
                console.log('🔄 Auto-saved LIFF ID from URL to CosmosDB');
                queryClient.invalidateQueries({ queryKey: ['/api/liff-settings'] });
              } catch (error) {
                console.error('Failed to auto-save LIFF ID:', error);
              }
            }
          }
        }
      } catch (e) {
        console.error('LIFF initialization failed:', e);
        setError('LIFF初期化に失敗しました。ページをリロードしてください。');
      }
    })();
    // 設定が更新されたら再初期化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liffSettingsQuery.data?.liffId, cookieInfo?.hasUid]);

  // whoami（uid cookie の有無）
  useEffect(() => {
    fetch('/api/whoami', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setCookieInfo(j))
      .catch(() => setCookieInfo(null));
  }, [isLoggedIn, isAdmin]);

  // URLパラメータまたはサーバー設定からLIFF IDをフォームに自動入力
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const liffIdFromUrl = sp.get("liff") || sp.get("liffId");

    if (liffIdFromUrl) {
      liffIdForm.setValue('liffId', liffIdFromUrl);
    } else if (liffSettingsQuery.data?.success && liffSettingsQuery.data.liffId) {
      liffIdForm.setValue('liffId', liffSettingsQuery.data.liffId);
    }
  }, [liffSettingsQuery.data, liffIdForm]);

  // secrets 指紋（存在確認）
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/line-secrets", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.exists) setFingerprints(j.fingerprints ?? null);
        }
      } catch {/* noop */ }
    })();
  }, []);

  // 管理者 cookie 設定
  const firedAdminLoginRef = useRef(false);
  const setAdminCookie = useMutation<
    void,
    Error,
    { lineUserId: string; displayName?: string; pictureUrl?: string | null }
  >({
    mutationFn: async (vars) => {
      await apiRequest("POST", "/api/line-admin", vars);
    },
  });

  useEffect(() => {
    if (!userProfile?.userId) return;
    if (firedAdminLoginRef.current) return;
    firedAdminLoginRef.current = true;
    if (!setAdminCookie.isPending) {
      setAdminCookie.mutate({
        lineUserId: userProfile.userId,
        displayName: userProfile.displayName,
        pictureUrl: userProfile.pictureUrl ?? null,
      });
    }
  }, [userProfile?.userId, setAdminCookie]);

  // アカウント一覧（admin タブ時）
  useEffect(() => {
    if (isTab === "top") return;
    if (!userProfile?.userId) return;
    if (!cookieInfo?.hasUid) return;
    let aborted = false;
    (async () => {
      try {
        const r = await fetch("/api/line-secrets?mine=1", { credentials: "include" });
        if (aborted) return;
        if (r.status === 401) { setAccounts([]); setSelectedBasicId(""); return; }
        const j = await r.json();
        const raw = Array.isArray(j?.items) ? j.items : [];
        const normalized: Account[] = raw
          .map((a: any): Account => ({
            basicId: typeof a?.basicId === "string" ? a.basicId : "",
            channelName: typeof a?.channelName === "string" ? a.channelName : undefined,
            channelId: typeof a?.channelId === "string" ? a.channelId : undefined,
          }))
          .filter((a: { basicId: string }) => a.basicId !== "");
        setAccounts(normalized);
        setBasicId(normalized[0]?.basicId ?? "");
        setSelectedBasicId((prev) => prev || (normalized[0]?.basicId ?? ""));
      } catch {
        if (!aborted) { setAccounts([]); setSelectedBasicId(""); }
      }
    })();

    return () => { aborted = true; };
  }, [isAdmin, userProfile?.userId, cookieInfo?.hasUid, isTab]);

  // URL パラメータ→状態
  useEffect(() => {
    if (pathname === '/open') return;

    const sp = new URLSearchParams(window.location.search);
    const lid = sp.get("lid");
    const formParam = sp.get("form");
    const notifyParam = sp.get("notify");
    const entryParam = sp.get("entry");

    if (entryParam) setOverrideUserEntry(ensureEntryFormat(entryParam));

    if (lid) {
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
          showToast("リンクが無効または期限切れです", "error");
        }
      })();
    } else if (formParam) {
      setFormUrl(decodeURIComponent(formParam));
      setIsAutoMode(true);
    }

    if (notifyParam === "0") setNotifyEnabled(false);
    if (notifyParam === "1") setNotifyEnabled(true);
  }, [pathname, showToast]);

  // タイトル同期
  useEffect(() => {
    if (formTitle) document.title = formTitle;
  }, [formTitle]);

  // entry 検出（admin タブ時）
  const viewUrlNormalized = useMemo(() => {
    try {
      return (GoogleFormsManager as any).normalizeFormUrl
        ? (GoogleFormsManager as any).normalizeFormUrl(formUrl)
        : formUrl;
    } catch {
      return formUrl;
    }
  }, [formUrl]);

  const detectTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isAdmin || isTab !== 'admin') return;
    if (!viewUrlNormalized) {
      setDetectedEntries(null);
      setDetectionError(null);
      return;
    }
    if (detectTimerRef.current) window.clearTimeout(detectTimerRef.current);

    detectTimerRef.current = window.setTimeout(async () => {
      setIsDetecting(true);
      setDetectionError(null);
      try {
        const res = await GoogleFormsManager.detectEntryIds(viewUrlNormalized);
        if (res?.success && res.userId) {
          setDetectedEntries({ userId: res.userId });
          setLastDetectionResult({ userId: res.userId, formUrl: viewUrlNormalized });
          if (res.title) setFormTitle(res.title);
          if (res.description) setFormDescription(res.description);
        } else {
          setDetectedEntries(null);
          setDetectionError(res?.error || 'entry IDの自動検出に失敗しました。手動で入力してください。');
          if (res?.title) setFormTitle(res.title);
          if (res?.description) setFormDescription(res.description);
        }
      } catch (e: any) {
        setDetectedEntries(null);
        setDetectionError('entry IDの自動検出に失敗しました。手動で入力してください。');
        console.warn('Detection error:', e);
      } finally {
        setIsDetecting(false);
      }
    }, 500);

    return () => {
      if (detectTimerRef.current) window.clearTimeout(detectTimerRef.current);
    };
  }, [viewUrlNormalized, isAdmin, isTab]);

  // prefill URL（自動モード時）
  useEffect(() => {
    (async () => {
      if (formUrl && isAutoMode) {
        // For notifications enabled: require userProfile
        // For notifications disabled: generate URL without userProfile if possible
        if (notifyEnabled && !userProfile) {
          setGeneratedUrl(null);
          setIsGeneratingUrl(false);
          return;
        }

        setIsGeneratingUrl(true);
        try {
          const userId = userProfile?.userId || 'anonymous';
          // const url = await generatePrefillUrl(formUrl, userProfile.userId);
          // setGeneratedUrl(url);
          const url = await generatePrefillUrl(formUrl, userId);
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
  }, [
    userProfile?.userId,
    formUrl,
    isAutoMode,
    lastDetectionResult?.userId,
    detectedEntries?.userId,
    overrideUserEntry,
    notifyEnabled///add
  ]);

  // ---- auto open once ----------------------------------------------------
  // useEffect(() => {
  //   if (isAutoMode && isLoggedIn && userProfile && generatedUrl && !autoTriggeredRef.current) {
  //     autoTriggeredRef.current = true;
  //     void sendLineMessageAndOpenForm(false);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [isAutoMode, isLoggedIn, userProfile?.userId, generatedUrl]);
  useEffect(() => {
    if (isAutoMode && generatedUrl && !autoTriggeredRef.current) {
      // For notifications enabled: require login
      // For notifications disabled: no login required
      if (notifyEnabled) {
        if (isLoggedIn && userProfile) {
          autoTriggeredRef.current = true;
          void sendLineMessageAndOpenForm(false);
        }
      } else {
        // No login required when notifications are disabled
        autoTriggeredRef.current = true;
        void sendLineMessageAndOpenForm(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAutoMode,
    isLoggedIn,
    userProfile?.userId,
    generatedUrl,
    notifyEnabled///add
  ]);

  // サーバから届いた liffId をフォームに反映
  useEffect(() => {
    if (liffSettingsQuery.data?.success && liffSettingsQuery.data.liffId) {
      liffIdForm.setValue('liffId', liffSettingsQuery.data.liffId);
    }
  }, [liffSettingsQuery.data, liffIdForm]);

  /* ------------------------------ Handlers ---------------------------------- */

  const onLiffIdSubmit = (data: LiffIdFormData) => {
    saveLiffIdMutation.mutate(data);
  };

  const saveUserToBackend = async (profile: LiffProfile) => {
    try {
      await apiRequest('POST', '/api/line-users', {
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
      });
    } catch (e) {
      console.error('Failed to save user to backend:', e);
    }
  };

  const handleLineLogin = async () => {
    const ok = await ensureLiffReady();
    if (!ok) { setError("LIFF ID を URL/フォーム/ENV のいずれかで指定してください。"); return; }
    // ログイン前に現在の画面状態を保存
    const appState = {
      isTab,
      isAdmin,
      isAutoMode
    };
    console.log('🔄 [LOGIN] Saving app state to sessionStorage:', appState);
    sessionStorage.setItem('returnTo', location.href);
    sessionStorage.setItem('appState', JSON.stringify(appState));
    // 保存後の確認
    console.log('🔄 [LOGIN] sessionStorage after saving:', {
      returnTo: sessionStorage.getItem('returnTo'),
      appState: sessionStorage.getItem('appState')
    });
    if (liffManager.isLoggedIn()) {
      await liffManager.logout();
    }
    await liffManager.login({ redirectUri: location.href });
  };

  const loginMutation = useMutation<LiffProfile, Error>({
    mutationFn: async () => {
      const ready = await ensureLiffReady();
      if (!ready) throw new Error('LIFF not ready');
      await liffManager.login();
      const profile = await liffManager.getProfile();
      if (!profile) throw new Error('Profile not available');
      await saveUserToBackend(profile);
      return profile;
    },
    onSuccess: (profile) => {
      setUserProfile(profile);
      setLineUserId(profile.userId);
      setIsLoggedIn(true);
      setError(null);
    },
    onError: (e) => {
      console.error('Login failed:', e);
      setError('ログインに失敗しました。もう一度お試しください。');
    },
  });

  const relogin = async () => {
    try {
      const ready = await ensureLiffReady();
      if (!ready) return;
      if (liffManager.isLoggedIn()) {
        await liffManager.logout();
      }
      await liffManager.login();
      if (liffManager.isLoggedIn()) {
        const profile = await liffManager.getProfile();
        if (profile) {
          setUserProfile(profile);
          setIsLoggedIn(true);
          await saveUserToBackend(profile);
        }
        setLineUserId((await liffManager.getProfile())!.userId);
      }
    } catch (e) {
      console.error('再ログイン処理に失敗:', e);
      setError('再ログインに失敗しました。ページをリロードしてください。');
    }
  };

  const handleGenerateLink = async () => {
    if (!formUrl.trim()) {
      showToast("フォームURLを先に入力してください", "error");
      return;
    }

    // 通知が有効な場合のみユーザープロファイルが必要
    // if (!userProfile?.userId) {
    //   showToast("LINEログイン後にお試しください（userId 未取得）", "error");
    //   return;
    // }
    if (notifyEnabled && !userProfile?.userId) {
      showToast("通知を送信するにはLINEログインが必要です", "error");
      return;
    }

    // 通知が無効な場合でもLIFF IDは必要
    if (!notifyEnabled) {
      const sp = new URLSearchParams(location.search);
      const liffFromUrl = sp.get("liff") || sp.get("liffId") || undefined;
      const liffFromForm = liffIdForm.getValues()?.liffId?.trim() || undefined;
      const liffFromServer = liffSettingsQuery.data?.liffId?.trim() || undefined;
      const liffFromEnv = process.env.NEXT_PUBLIC_LIFF_ID || undefined;
      const currentLiffId = liffFromForm || liffFromUrl || liffFromServer || liffFromEnv;

      if (!currentLiffId || !LIFF_ID_RE.test(currentLiffId)) {
        showToast("LIFF IDを正しく入力してください", "error");
        return;
      }
    }

    setIsDetecting(true);
    setSignedLink("");

    try {
      const normalized = viewUrlNormalized;
      let nextTitle = formTitle || "Googleフォーム";
      let nextDesc = formDescription || "リンクを開くにはこちらをタップ";
      let nextBgcolor = formBgcolor || "#555555";

      // 任意の検出
      try {
        const result = await GoogleFormsManager.detectEntryIds(normalized);
        if (result?.success) {
          if (result.title) nextTitle = result.title;
          if (result.description) nextDesc = result.description;
          setDetectedEntries({ userId: result.userId });
          if (result.userId) setLastDetectionResult({ userId: result.userId, formUrl: normalized });
        }
      } catch {/* ignore */ }

      setFormTitle(nextTitle);
      setFormDescription(nextDesc);
      setFormBgcolor(nextBgcolor);

      // payload
      const payload: Record<string, any> = {
        form: normalized,
        title: String(nextTitle ?? ""),
        desc: String(nextDesc ?? ""),
        notify: notifyEnabled ? 1 : 0,
        bgcolor: nextBgcolor,
      };

      if (payload.notify === 1) {
        const picked = (selectedBasicId || basicId || "").trim();
        if (!picked) {
          showToast("公式LINE（basicId）を選択してください", "error");
          return;
        }
        payload.basicId = picked;
      }

      if (overrideUserEntry.trim()) {
        payload.entry = ensureEntryFormat(overrideUserEntry);
      }

      // 現在の LIFF ID を解決（フォーム > URL > サーバ設定 > ENV）
      const sp = new URLSearchParams(location.search);
      const liffFromUrl = sp.get("liff") || sp.get("liffId") || undefined;
      const liffFromForm = liffIdForm.getValues()?.liffId?.trim() || undefined;
      const liffFromServer = liffSettingsQuery.data?.liffId?.trim() || undefined;
      const liffFromEnv = process.env.NEXT_PUBLIC_LIFF_ID || undefined;
      const currentLiffId = liffFromForm || liffFromUrl || liffFromServer || liffFromEnv;

      if (currentLiffId && LIFF_ID_RE.test(currentLiffId)) {
        payload.liffId = currentLiffId;
      }

      // 生成
      const r = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const t = await r.text();
      let j: any = null;
      try { j = t ? JSON.parse(t) : null; } catch {/* noop */ }
      if (!r.ok || !j?.ok) {
        const code = j?.code || "UNKNOWN";
        console.error("links-create error:", { status: r.status, code, detail: j ?? t });
        const msgMap: Record<string, string> = {
          NO_ADMIN_ID: "（ログイン情報が無効です）",
          BAD_FORM_URL: "フォームURLが正しくありません。",
          NO_FORM: "フォームURLを入力してください。",
          NO_BASIC_ID: "通知ON時は公式LINE（basicId）が必須です。",
        };
        showToast(msgMap[code] || `エラー: ${code}（${r.status}）`, "error");
        return;
      }

      // 返却用リンクを強化：entry と liff を必要なら付与
      let enhancedLink: string = j.link;

      if (overrideUserEntry.trim()) {
        enhancedLink += `${enhancedLink.includes('?') ? '&' : '?'}entry=${encodeURIComponent(ensureEntryFormat(overrideUserEntry))}`;
      }
      if (currentLiffId && LIFF_ID_RE.test(currentLiffId)) {
        enhancedLink += `${enhancedLink.includes('?') ? '&' : '?'}liff=${encodeURIComponent(currentLiffId)}`;
      }

      setSignedLink(enhancedLink);
      showToast("連携リンクを生成しました", "success");
    } catch (e) {
      console.error("generate link failed:", e);
      showToast("連携リンク生成でエラーが発生しました", "error");
    } finally {
      setIsDetecting(false);
    }
  };

  const generatePrefillUrl = async (originalUrl: string, userId: string): Promise<string> => {
    try {
      const baseUrl = originalUrl.split('?')[0];

      // 優先度：手入力 > 直近検出 > その場検出
      let userIdEntry =
        (overrideUserEntry.trim() ? ensureEntryFormat(overrideUserEntry) : '') ||
        (lastDetectionResult?.formUrl === originalUrl ? lastDetectionResult.userId : detectedEntries?.userId);

      if (!userIdEntry) {
        try {
          const detection = await GoogleFormsManager.detectEntryIds(originalUrl);
          if (detection.success && detection.userId) {
            userIdEntry = detection.userId;
            setLastDetectionResult({ userId: detection.userId, formUrl: originalUrl });
            setDetectedEntries({ userId: detection.userId });
            if (detection.title) setFormTitle(detection.title);
            if (detection.description) setFormDescription(detection.description);
          }
        } catch {/* noop */ }
      }

      if (!userIdEntry) {
        throw new Error("このフォームでは自動UID連携に対応していません。手動でentry IDを指定してください。");
      }

      const params = new URLSearchParams();
      params.set('usp', 'pp_url');
      params.set(userIdEntry, userId);

      return `${baseUrl}?${params.toString()}`;
    } catch (e) {
      console.error('Failed to generate prefill URL:', e);
      return originalUrl;
    }
  };

  /* ---- preview card image ---- */
  const previewUrl = useMemo(() => {
    if (!viewUrlNormalized) return '';
    const params = new URLSearchParams({
      form: viewUrlNormalized,
      title: formTitle || '',
      desc: formDescription || 'リンクを開くにはこちらをタップ',
      notify: notifyEnabled ? '1' : '0',
      v: String(Date.now()),
    });
    return `${window.location.origin}/api/link-preview?${params.toString()}`;
  }, [viewUrlNormalized, formTitle, formDescription, notifyEnabled]);

  /* ---- send + navigate ---- */
  const sendLineMessageAndOpenForm = async (manual: boolean) => {
    //    if (!userProfile || !generatedUrl) return;
    if (!generatedUrl) return;
    if (notifyEnabled && !userProfile) return;

    const qs = new URLSearchParams(window.location.search);
    const lid = qs.get("lid") || "";
    const aid = qs.get("aid") || "";
    const formId = qs.get("formId") || (viewUrlNormalized?.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//)?.[1] ?? "");
    const exp = Number(qs.get("exp") || "0");
    const sig = qs.get("sig") || "";
    const debug = qs.get("debug") === "1";

    //    if (!messageSentRef.current && notifyEnabled) {
    if (!messageSentRef.current && notifyEnabled && userProfile) {
      messageSentRef.current = true;
      const payload = {
        userId: userProfile.userId,
        type: "card" as const,
        formUrl: generatedUrl,
        title: formTitle || "Googleフォーム",
        desc: formDescription || "フォームに回答してください。",
        bgcolor: formBgcolor || "#555555",
        ...(lid ? { lid } : { aid, formId, exp, sig }),
      };
      try {
        let sent = false;
        if ("sendBeacon" in navigator) {
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          sent = navigator.sendBeacon("/api/line", blob);
          console.log("[send] via sendBeacon =", sent);
        }
        if (!sent) {
          const r = await fetch("/api/line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
          });
          const t = await r.text();
          console.log("[send] fetch status:", r.status, "body:", t);
          if (!r.ok) {
            try {
              const j = JSON.parse(t);
              showToast(`送信失敗: ${j?.code ?? r.status}`, "error");
            } catch {
              showToast(`送信失敗: ${r.status}`, "error");
            }
          }
        }
      } catch (e) {
        console.warn("send-message failed:", e);
        showToast("送信時にエラーが発生しました", "error");
      }
    }

    if (!debug && !navigatedRef.current) {
      navigatedRef.current = true;
      const go = () => window.location.replace(generatedUrl);
      if (manual) go(); else setTimeout(go, 250);
    }
  };

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

  return (
    <>
      <HomeClient />
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
          {/* Show login button only when needed for auto-mode AND notifications enabled */}
          {isAutoMode && !isLoggedIn && notifyEnabled && (
            <Button
              onClick={handleLineLogin}
              disabled={loginMutation.isPending}
              className="w-full bg-line-green hover:bg-line-brand text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 min-h-[48px]"
              data-testid="button-line-login"
            >
              {loginMutation.isPending ? '認証中...' : 'LINEでログイン'}
            </Button>
          )}

          {formUrl && isAutoMode && (
            isGeneratingUrl ? (
              <div className="text-center">
                <h3 className="text-base font-semibold">
                  <span className="text-blue-600">フォームへ移動中...</span>
                </h3>
              </div>
            ) : (
              // Show manual access button regardless of login status when notifications are disabled
              (notifyEnabled ? (isLoggedIn && userProfile) : true) && (
                <button
                  onClick={() => sendLineMessageAndOpenForm(true)}
                  disabled={isSendingMessage || !generatedUrl}
                  className="w-full p-0 h-auto"
                  data-testid="button-access-form"
                >
                  <div className="text-center text-blue">
                    <p className="text-sm text-blue-800 mt-6">自動でフォームにアクセスしない時はここをクリック</p>
                  </div>
                </button>
              )
            )
          )}

          {!isAutoMode && isTab !== 'secret' && isTab !== 'howto' && (
            <>
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">管理者モード</h3>
                  </div>

                  {isAdmin && isTab === 'admin' && (
                    <div className="space-y-4">
                      <div>
                        <Input
                          type="url"
                          value={formUrl}
                          onChange={(e) => {
                            setFormUrl(e.target.value);
                            setDetectedEntries(null);
                            setLastDetectionResult(null);
                            setSignedLink("");
                            setDetectionError(null);
                          }}
                          placeholder="ここにGoogleフォームのURLを入力"
                          className="pr-5 text-gray-500 text-sm bg-blue-200"
                        />

                        {formUrl ? (
                          <div className="mt-3 p-3 rounded border bg-white">
                            <div className="text-xs text-gray-700 mb-2 font-semibold">ENTRY ID 検出結果</div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">検出された欄（読み取り専用）</label>
                                <Input
                                  value={detectedEntries?.userId ?? ''}
                                  readOnly
                                  placeholder="未検出"
                                  className="text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">entryID を手入力（最優先）</label>
                                <Input
                                  value={overrideUserEntry}
                                  onChange={(e) => setOverrideUserEntry(e.target.value)}
                                  placeholder="例）entry.123456789 または 123456789"
                                  className="text-xs"
                                />
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between">
                              <div className="text-xs">
                                {isDetecting ? <span className="text-blue-600">検出中...</span> :
                                  detectionError ? <span className="text-red-600">検出エラー: {detectionError}</span> :
                                    detectedEntries?.userId ? <span className="text-green-700">検出OK</span> :
                                      <span className="text-gray-600">未検出（手入力をご利用ください）</span>
                                }
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => {
                                    if (!overrideUserEntry && !detectedEntries?.userId) {
                                      showToast('entryID を入力してください', 'error');
                                      return;
                                    }
                                    const u = ensureEntryFormat(overrideUserEntry || detectedEntries!.userId!);
                                    setOverrideUserEntry(u);
                                    showToast(`entryID を固定: ${u}`, 'success');
                                  }}
                                  variant="secondary"
                                  size="sm"
                                  className="text-xs"
                                >
                                  この entryID を使う
                                </Button>
                              </div>
                            </div>
                            <div className="text-[11px] text-gray-500 mt-2">
                              ※ 手入力がある場合は、生成URL・LINE送信ともに<strong>手入力を最優先</strong>します。
                            </div>
                          </div>
                        ) : null}

                        {/* Notification Settings Section */}
                        <div className="my-4 p-4 bg-gray-50 rounded-lg border">
                          <h4 className="text-sm font-semibold text-gray-800 mb-3">通知設定</h4>

                          {/* Notification Enable Checkbox */}
                          <div className="flex items-center space-x-3 mb-3">
                            <input
                              id="notify"
                              type="checkbox"
                              checked={notifyEnabled}
                              onChange={(e) => {
                                setNotifyEnabled(e.target.checked);
                                // handleLineLogin(),
                                // if (liffManager.isLoggedIn()) {
                                //   await liffManager.logout();
                                // }
                              }}
                              className="h-4 w-4 text-green-600 border-gray-300 rounded"
                              data-testid="checkbox-enable-notifications"
                            />
                            <label htmlFor="notify" className="text-sm text-gray-700 font-medium">
                              フォーム回答通知を公式LINEで受け取る
                            </label>
                          </div>

                          {/* Conditional Notification Configuration */}
                          {notifyEnabled && (
                            <div className="mt-3 p-3 bg-white rounded border">
                              {!cookieInfo?.hasUid || !isLoggedIn ? (
                                // Show login prompt when notifications enabled but not logged in or no LIFF login
                                <div className="text-center">
                                  <p className="text-sm text-gray-600 mb-3">
                                    通知機能を使用するにはLINEログインが必要です
                                  </p>
                                  <Button
                                    onClick={() => {
                                      // ログイン後にチャネル設定画面に戻るよう状態を事前保存
                                      sessionStorage.setItem('appState', JSON.stringify({
                                        isTab: 'secret',
                                        isAdmin: false,
                                        isAutoMode: false
                                      }));
                                      handleLineLogin();
                                    }}
                                    disabled={loginMutation.isPending}
                                    className="bg-[#00be00] hover:bg-[#00a000] text-white"
                                    data-testid="button-login-for-notifications"
                                  >
                                    {loginMutation.isPending ? '認証中...' : 'LINEログインして通知を設定'}
                                  </Button>
                                </div>
                              ) : (
                                // Show notification configuration when logged in
                                <div>
                                  <label className="block text-sm text-gray-700 mb-2">受信用公式LINE</label>
                                  <select
                                    className="w-full p-2 border border-gray-300 rounded text-sm"
                                    value={selectedBasicId}
                                    onChange={(e) => { setSelectedBasicId(e.target.value); setBasicId(e.target.value); }}
                                    data-testid="select-basic-id"
                                  >
                                    {!accounts.length && <option value="">（未登録）</option>}
                                    {accounts.map((a) => {
                                      const text = (a.channelName || a.basicId);
                                      const fontSize = text.length > 20 ? "12px" : "14px";
                                      return (
                                        <option key={a.basicId} value={a.basicId} style={{ fontSize }}>
                                          {text}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {!accounts.length && (
                                    <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200">
                                      <p className="text-xs text-amber-700">
                                        公式LINEアカウントが未登録です。設定画面で公式LINEを登録してください。
                                      </p>
                                      <Button
                                        onClick={() => {
                                          setIsAdmin(false);
                                          setIsTab('secret');
                                        }}
                                        variant="outline"
                                        size="sm"
                                        className="mt-2 text-xs"
                                        data-testid="button-goto-line-settings"
                                      >
                                        公式LINE設定画面へ
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {!notifyEnabled && (
                            <p className="text-xs text-gray-500 mt-2">
                              通知を無効にした場合、フォーム回答の通知は送信されません
                            </p>
                          )}
                        </div>

                        {formUrl &&
                          <Button
                            onClick={handleGenerateLink}
                            disabled={isDetecting}
                            variant={formUrl ? 'default' : 'outline'}
                            size="sm"
                            className="mt-2 w-full text-white border-blue-300 hover:bg-blue-500 mb-2"
                          >
                            {isDetecting ? '連携リンク生成中...' : '✨ 連携リンクを生成'}
                          </Button>
                        }
                      </div>

                      <div className="space-y-3">
                        {isDetecting &&
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-line-green mx-auto mb-4" />
                        }
                        {signedLink &&
                          <>
                            <div className="p-4 bg-blue-100 rounded-lg border">
                              <h4 className="text-xs text-gray-800 mb-2">
                                連携リンクを生成しました。以下のリンクを <strong>GoogleフォームURL</strong>としてご利用ください。
                              </h4>
                              <div className="bg-white rounded border p-3 mb-3">
                                <code className="text-xs font-mono text-gray-800 break-all">
                                  {isDetecting ? '...' : (signedLink || '・・・')}
                                </code>
                              </div>
                            </div>
                            {cookieInfo?.hasUid ?
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
                              : '未ログイン'}
                          </>
                        }
                      </div>

                      {/* {notifyEnabled && (
                        <div className="border-t pt-4">
                          <div className="space-y-2">
                            <p className="text-gray-600 mb-6 text-xs leading-relaxed" style={{ color: !accounts.length ? 'red' : undefined }}>
                              回答通知を受け取るには、公式LINEの設定が必要です
                            </p>
                            <Button
                              onClick={() => {
                                handleLineLogin();
                                setIsAdmin(false);
                                setIsTab('secret');
                              }}
                              disabled={loginMutation.isPending}
                              className="w-full bg-green-600 hover:bg-green-700"
                              data-testid="button-line-login"
                            >
                              {loginMutation.isPending ? '認証中...' : 'フォーム回答通知機能 設定画面へ'}
                            </Button>
                          </div>
                        </div>
                      )} */}
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
                            3. 質問１の必須: ON<br />（上部メールアドレス設定は任意）
                          </p>
                        </div>
                      </div>
                      {/* Debug: ユーザー情報表示 */}
                      {/* {`${lineUserId}`} */}
                      {/* <Button onClick={handleLineLogin} disabled={false} className="w-full bg-[#00be00]">
                        ログイン
                      </Button> */}
                      {/* {isLoggedIn && userProfile && (
                        <div className="p-2 bg-gray-100 rounded text-xs text-gray-600 mb-2">
                          ユーザーID: {userProfile.userId}
                        </div>
                      )} */}
                      {/* LIFF ID 設定フォーム */}
                      <div className="p-3 bg-blue-50 rounded-lg mb-4">
                        <h5 className="text-sm font-semibold text-gray-800 mb-1">LIFF ID設定</h5>
                        <p className="text-sm text-gray-700 mb-3">
                          LINE連携に必要なLIFF IDを設定してください
                        </p>
                        <p className="text-sm text-gray-600">
                          <a href="https://developers.line.biz/console/" target="blank" style={{ color: "blue" }}>
                            LINE Developers Console
                          </a> にログイン
                        </p>
                        <p className="text-sm text-gray-600">
                          <span className="M7eMe">
                            <span style={{
                              backgroundColor: '#06c755',
                              color: '#ffffff'
                            }}>{`</>`}</span> <span >LINEログイン から取得</span>
                          </span></p>
                        <Form {...liffIdForm}>
                          <form onSubmit={liffIdForm.handleSubmit(onLiffIdSubmit)} className="space-y-3">
                            <FormField
                              control={liffIdForm.control}
                              name="liffId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs font-medium text-gray-700">
                                    LIFF ID
                                  </FormLabel>
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

                            {/* <div className="flex items-center justify-between">
                              <div className="text-xs text-gray-600">
                                {(() => {
                                  const sp = new URLSearchParams(window.location.search);
                                  const liffIdFromUrl = sp.get("liff") || sp.get("liffId");
                                  const liffIdFromForm = liffIdForm.watch('liffId');
                                  const hasLiffId = liffIdFromUrl || liffIdFromForm || liffSettingsQuery.data?.liffId;

                                  if (liffSettingsQuery.isLoading) {
                                    return <span className="text-blue-600">読み込み中...</span>;
                                  }
                                  return hasLiffId ? (
                                    <span className="text-green-700 font-medium">設定済み</span>
                                  ) : (
                                    <span className="text-orange-600">未設定</span>
                                  );
                                })()}
                              </div>

                              <Button
                                type="submit"
                                size="sm"
                                disabled={saveLiffIdMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5"
                                data-testid="button-save-liff-id"
                              >
                                {saveLiffIdMutation.isPending ? '保存中...' : '保存'}
                              </Button>
                            </div> */}
                          </form>
                        </Form>
                      </div>

                      <Button
                        onClick={() => { setIsAdmin(true), setIsTab('admin') }}
                        variant="default"
                        size="sm"
                        disabled={(() => {
                          const sp = new URLSearchParams(window.location.search);
                          const liffIdFromUrl = sp.get("liff") || sp.get("liffId");
                          const liffIdFromForm = liffIdForm.watch('liffId');
                          const hasLiffId = liffIdFromUrl || liffIdFromForm || liffSettingsQuery.data?.liffId;
                          return !hasLiffId;
                        })()}
                        className={`w-full mt-2 ${(() => {
                          const sp = new URLSearchParams(window.location.search);
                          const liffIdFromUrl = sp.get("liff") || sp.get("liffId");
                          const liffIdFromForm = liffIdForm.watch('liffId');
                          const hasLiffId = liffIdFromUrl || liffIdFromForm || liffSettingsQuery.data?.liffId;
                          return !hasLiffId
                            ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                            : 'text-green-700 border-blue-300 hover:bg-blue-700 text-white';
                        })()}`}
                        data-testid="button-start-admin"
                      >
                        {(() => {
                          const sp = new URLSearchParams(window.location.search);
                          const liffIdFromUrl = sp.get("liff") || sp.get("liffId");
                          const liffIdFromForm = liffIdForm.watch('liffId');
                          const hasLiffId = liffIdFromUrl || liffIdFromForm || liffSettingsQuery.data?.liffId;
                          return !hasLiffId ? (
                            <span>準備中... (LIFF IDを入力してください)</span>
                          ) : (
                            <span>準備完了！　はじめる</span>
                          );
                        })()}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
          {isTab === 'secret' && (
            <LineSettingsClient onClick={() => { setIsTab('admin'), setIsAdmin(true) }} login={handleLineLogin} />
          )}
          {isTab === 'howto' && (
            <Howto onClick={() => { setIsTab('admin'), setIsAdmin(true) }} />
          )}
          <div className="flex flex-row justify-center m-4">
            <div className="px-2">
              {isTab === "top" ? (
                <button className="rounded-full h-5 w-5 bg-primary" />
              ) : (
                <button onClick={() => { setIsTab("top"), setIsAdmin(false) }}>
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                </button>
              )}
            </div>
            <div className="px-2">
              {isTab === "admin" ? (
                <button className="rounded-full h-5 w-5 bg-primary" />
              ) : (
                <button onClick={() => { setIsTab("admin"), setIsAdmin(true) }}>
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                </button>
              )}
            </div>
            {/* {notifyEnabled && ( */}
            <div className="px-2">
              {isTab === "secret" ? (
                <button className="rounded-full h-5 w-5 bg-primary" />
              ) : (
                <button onClick={() => { setIsTab("secret"); setIsAdmin(false); }}>
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                </button>
              )}
            </div>
            {/* )} */}
            <div className="px-2">
              {isTab === "howto" ? (
                <button className="rounded-full h-5 w-5 bg-primary" />
              ) : (
                <button onClick={() => { setIsTab("howto"); setIsAdmin(false); }}>
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                </button>
              )}
            </div>
          </div>
        </main>

        <footer className="max-w-md mx-auto px-4 py-6 text-center">
          <div className="text-xs text-gray-500 space-y-2">
            <p>© 2025 LINE UID Collection System by konoyubi</p>
            <div className="flex items-center justify-center space-x-4">
              {/* <a
                href="https://github.com/asagaorino0/LINE_login.git"
                className="hover:text-line-green transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="w-3 h-3 mr-1 inline" />
                GitHub
              </a>
              <a href="#" className="hover:text-line-green transition-colors">
                <Shield className="w-3 h-3 mr-1 inline" />
                プライバシー
              </a>
              <a href="#" className="hover:text-line-green transition-colors">
                <HelpCircle className="w-3 h-3 mr-1 inline" />
                サポート
              </a> */}

            </div>
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
