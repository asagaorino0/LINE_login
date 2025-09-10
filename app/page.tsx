'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Copy } from 'lucide-react';
import { ToastNotification, useToastNotification } from '../components/ui/toast-notification';

import { apiRequest } from './lib/queryClient';
import { GoogleFormsManager } from './lib/googleForms';
import { liffManager, LiffProfile } from '@/lib/liff';
import HomeClient from './(public)/HomeClient';
import LineSettingsClient from './line-settings/client';
import Howto from './line-settings/howto';

export default function Home() {
  type Account = {
    basicId: string;
    channelName?: string;
    channelId?: string;
  };

  // ---- routing / accounts ------------------------------------------------
  const [pathname, setPathname] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBasicId, setSelectedBasicId] = useState<string>("");

  // ---- app state ---------------------------------------------------------
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

  // 検出結果（ラベルは使わない。メッセージ欄も廃止）
  const [detectedEntries, setDetectedEntries] = useState<{ userId?: string } | null>(null);
  const [lastDetectionResult, setLastDetectionResult] = useState<{ userId: string; formUrl: string } | null>(null);

  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('公式LINE連携_Googleフォーム');
  const [formDescription, setFormDescription] = useState('リンクを開くにはこちらをタップ');
  const [formBgcolor, setFormBgcolor] = useState('#555555');
  const [notifyEnabled, setNotifyEnabled] = useState(false);

  // 署名付きリンク（配布用）
  const [signedLink, setSignedLink] = useState<string>("");
  const [basicId, setBasicId] = useState<string>("");

  // ★ 検出エラー表示 & 手入力オーバーライド（これを最優先）
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [overrideUserEntry, setOverrideUserEntry] = useState<string>(""); // 手入力entry ID

  const { toast, showToast, hideToast } = useToastNotification();
  const autoTriggeredRef = useRef(false);
  const messageSentRef = useRef(false);
  const navigatedRef = useRef(false);
  const linkCtxRef = useRef<{ lid?: string; aid?: string } | null>(null);
  const [cookieInfo, setCookieInfo] = useState<{ hasUid: boolean; uidMasked?: string } | null>(null);

  const [fingerprints, setFingerprints] = useState<{ liffId?: string; channelSecret?: string; channelAccessToken?: string } | null>(null);

  // ---- pathname ----------------------------------------------------------
  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  // ---- secrets (for admin accounts list) --------------------------------
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/line-secrets", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.exists) setFingerprints(j.fingerprints ?? null);
        }
      } catch { /* noop */ }
    })();
  }, []);

  // ---- set admin cookie --------------------------------------------------
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
    if (setAdminCookie.isPending) return;
    setAdminCookie.mutate({
      lineUserId: userProfile.userId,
      displayName: userProfile.displayName,
      pictureUrl: userProfile.pictureUrl ?? null,
    });
  }, [userProfile?.userId]);

  // ---- fetch my accounts once admin ready -------------------------------
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
        setSelectedBasicId(prev => prev || (normalized[0]?.basicId ?? ""));
      } catch {
        if (!aborted) { setAccounts([]); setSelectedBasicId(""); }
      }
    })();
    return () => { aborted = true; };
  }, [isAdmin, userProfile?.userId]);

  useEffect(() => {
    fetch("/api/whoami", { credentials: "include", cache: "no-store" })
      .then(r => r.json())
      .then(j => setCookieInfo(j))
      .catch(() => setCookieInfo(null));
  }, [isLoggedIn, isAdmin]);

  // ---- resolve lid/form params on first load ----------------------------
  useEffect(() => {
    if (pathname === '/open') return;

    const sp = new URLSearchParams(window.location.search);
    const lid = sp.get("lid");
    const formParam = sp.get("form");
    const notifyParam = sp.get("notify");
    const entryParam = sp.get("entry"); // ★ 追加: 手入力 entry を URL から受け取る

    if (entryParam) {
      setOverrideUserEntry(ensureEntryFormat(entryParam));
    }

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

          // サーバ保存の entry を将来読む場合に備えた互換（あれば反映）
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
  }, [pathname]);

  // ---- LIFF init ---------------------------------------------------------
  const relogin = async () => {
    try {
      await liffManager.init();
      if (liffManager.isLoggedIn()) {
        liffManager.logout();
      }
      await liffManager.login();
      if (liffManager.isLoggedIn()) {
        const profile = await liffManager.getProfile();
        if (profile) {
          setUserProfile(profile);
          setIsLoggedIn(true);
          await saveUserToBackend(profile);
        }
      }
    } catch (e) {
      console.error("再ログイン処理に失敗:", e);
      setError("再ログインに失敗しました。ページをリロードしてください。");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await liffManager.init();
        setIsInitialized(true);
        if (liffManager.isLoggedIn()) {
          const profile = await liffManager.getProfile();
          if (profile) {
            setUserProfile(profile);
            setIsLoggedIn(true);
            await saveUserToBackend(profile);
          }
        }
      } catch (e) {
        console.error('LIFF initialization failed:', e);
        setError('LIFF初期化に失敗しました。ページをリロードしてください。');
      }
    })();
  }, []);

  // ---- document title ----------------------------------------------------
  useEffect(() => {
    if (formTitle) document.title = formTitle;
  }, [formTitle]);

  // ---- normalize view url + auto detection (debounced) ------------------
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
    // 500ms debounce
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
          setDetectionError(null); // 成功時はエラーをクリア
        } else {
          setDetectedEntries(null);
          setDetectionError(res?.error || 'entry IDの自動検出に失敗しました。手動で入力してください。');
          // フォームのタイトルと説明は検出失敗時でも設定
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewUrlNormalized, isAdmin, isTab]);

  // ---- prefill URL generation (auto mode only) --------------------------
  useEffect(() => {
    (async () => {
      if (userProfile && formUrl && isAutoMode) {
        setIsGeneratingUrl(true);
        try {
          const url = await generatePrefillUrl(formUrl, userProfile.userId);
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
  }, [userProfile?.userId, formUrl, isAutoMode, lastDetectionResult?.userId, detectedEntries?.userId, overrideUserEntry]);

  // ---- auto open once ----------------------------------------------------
  useEffect(() => {
    if (isAutoMode && isLoggedIn && userProfile && generatedUrl && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      void sendLineMessageAndOpenForm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoMode, isLoggedIn, userProfile?.userId, generatedUrl]);

  // ---- helpers -----------------------------------------------------------
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

  const handleLineLogin = () => {
    if (!loginMutation.isPending) {
      setError(null);
      loginMutation.mutate();
    }
  };

  const loginMutation = useMutation<LiffProfile, Error>({
    mutationFn: async () => {
      await liffManager.login();
      const profile = await liffManager.getProfile();
      if (!profile) throw new Error('Profile not available');
      await saveUserToBackend(profile);
      return profile;
    },
    onSuccess: (profile) => {
      setUserProfile(profile);
      setIsLoggedIn(true);
      setError(null);
    },
    onError: (e) => {
      console.error('Login failed:', e);
      setError('ログインに失敗しました。もう一度お試しください。');
    },
  });

  // ---- 署名付きリンク生成（admin ボタン）------------------------------
  const handleGenerateLink = async () => {
    if (!formUrl.trim()) {
      showToast("フォームURLを先に入力してください", "error");
      return;
    }
    if (!userProfile?.userId) {
      showToast("LINEログイン後にお試しください（userId 未取得）", "error");
      return;
    }
    setIsDetecting(true);
    setSignedLink("");
    try {
      const normalized = viewUrlNormalized;
      let nextTitle = formTitle || "Googleフォーム";
      let nextDesc = formDescription || "リンクを開くにはこちらをタップ";
      let nextBgcolor = formBgcolor || "#555555";

      // 検出（任意）
      try {
        const result = await GoogleFormsManager.detectEntryIds(normalized);
        if (result?.success) {
          if (result.title) nextTitle = result.title;
          if (result.description) nextDesc = result.description;
          setDetectedEntries({ userId: result.userId });
          if (result.userId) setLastDetectionResult({ userId: result.userId, formUrl: normalized });
        }
      } catch { /* ignore */ }

      setFormTitle(nextTitle);
      setFormDescription(nextDesc);
      setFormBgcolor(nextBgcolor);

      // payload 構築（※ 将来サーバ保存するなら使う）
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

      // 手入力 entry をサーバにも渡しておく（互換用）
      if (overrideUserEntry.trim()) {
        payload.entry = ensureEntryFormat(overrideUserEntry);
      }

      const r = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      let j: any = null;
      try { j = text ? JSON.parse(text) : null; } catch { /* noop */ }
      if (!r.ok || !j?.ok) {
        const code = j?.code || "UNKNOWN";
        console.error("links-create error:", { status: r.status, code, detail: j ?? text });
        const msgMap: Record<string, string> = {
          NO_ADMIN_ID: "（ログイン情報が無効です）",
          BAD_FORM_URL: "フォームURLが正しくありません。",
          NO_FORM: "フォームURLを入力してください。",
          NO_BASIC_ID: "通知ON時は公式LINE（basicId）が必須です。",
        };
        showToast(msgMap[code] || `エラー: ${code}（${r.status}）`, "error");
        return;
      }

      // ★ 生成リンクに entry= を付与して返す（ここが肝）
      const baseLink: string = j.link;
      const withEntry = overrideUserEntry.trim()
        ? `${baseLink}${baseLink.includes('?') ? '&' : '?'}entry=${encodeURIComponent(ensureEntryFormat(overrideUserEntry))}`
        : baseLink;

      setSignedLink(withEntry);
      showToast("連携リンクを生成しました", "success");
    } catch (e) {
      console.error("generate link failed:", e);
      showToast("連携リンク生成でエラーが発生しました", "error");
    } finally {
      setIsDetecting(false);
    }
  };

  // ---- prefill url builder（自動モードで使う：メッセージは完全廃止） ----
  const generatePrefillUrl = async (originalUrl: string, userId: string): Promise<string> => {
    try {
      const baseUrl = originalUrl.split('?')[0];

      // ★ 優先度：手入力 > 直近検出 > その場検出 > ダミー
      let userIdEntry =
        (overrideUserEntry.trim() ? ensureEntryFormat(overrideUserEntry) : "") ||
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
        } catch { /* noop */ }
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

  // helper: "entry.123" の形に整える（数字だけ渡されてもOK）
  function ensureEntryFormat(s: string): string {
    const t = s.trim();
    if (!t) return t;
    if (/^\d+$/.test(t)) return `entry.${t}`;
    if (!/^entry\./i.test(t)) {
      const num = t.match(/(\d{5,})/);
      if (num) return `entry.${num[1]}`;
    }
    return t;
  }

  // ---- preview url (card image) -----------------------------------------
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

  // ---- send + navigate (once) -------------------------------------------
  const sendLineMessageAndOpenForm = async (manual: boolean) => {
    if (!userProfile || !generatedUrl) return;

    const qs = new URLSearchParams(window.location.search);
    const lid = qs.get("lid") || "";
    const aid = qs.get("aid") || "";
    const formId = qs.get("formId") || (viewUrlNormalized?.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//)?.[1] ?? "");
    const exp = Number(qs.get("exp") || "0");
    const sig = qs.get("sig") || "";
    const debug = qs.get("debug") === "1";

    if (!messageSentRef.current && notifyEnabled) {
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

  // ---- UI ---------------------------------------------------------------
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
          {/* 未ログイン & 自動モード */}
          {!isLoggedIn && isAutoMode && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">LINEでログイン</h2>
                  <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                    LINEアカウントでログインして、ユーザーIDを安全に取得します
                  </p>
                  <Button
                    onClick={handleLineLogin}
                    disabled={loginMutation.isPending}
                    className="w-full bg-line-green hover:bg-line-brand text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 min-h-[48px]"
                    data-testid="button-line-login"
                  >
                    {loginMutation.isPending ? '認証中...' : 'LINEでログイン'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 自動モード：ログイン済み → フォームアクセス */}
          {isLoggedIn && userProfile && formUrl && isAutoMode && (
            isGeneratingUrl ? (
              <div className="text-center">
                <h3 className="text-base font-semibold">
                  <span className="text-blue-600">フォームへ移動中...</span>
                </h3>
              </div>
            ) : (
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
          )}

          {/* 通常（管理者モード） */}
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

                        {/* ENTRY ID パネル */}
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

                        <div className="my-3 flex items-center space-x-2">
                          <input
                            id="notify"
                            type="checkbox"
                            checked={notifyEnabled}
                            onChange={(e) => setNotifyEnabled(e.target.checked)}
                            className="h-4 w-4 text-green-600 border-gray-300 rounded"
                          />
                          <label htmlFor="notify" className="text-base text-gray-700">
                            回答通知を公式LINEで受け取る
                          </label>
                        </div>
                        {notifyEnabled && (
                          <>
                            <label className="text-sm text-gray-700">受信用公式LINE</label>
                            <select
                              style={{ width: '100%' }}
                              value={selectedBasicId}
                              onChange={(e) => { setSelectedBasicId(e.target.value), setBasicId(e.target.value); }}
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
                          </>
                        )}
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

                      {notifyEnabled && (
                        <>
                          <div className="border-t pt-4">
                            <div className="space-y-2">
                              <p className="text-gray-600 mb-6 text-xs leading-relaxed" style={{ color: !accounts.length ? "red" : undefined }}>
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
                        </>
                      )}
                    </div>
                  )}
                  {isTab === 'top' && (
                    <>
                      <div className="p-3 bg-amber-50 rounded-lg mb-4">
                        <h5 className="text-sm font-semibold text-gray-800 mb-1">Googleフォーム側の重要な設定</h5>
                        <p className="text-sm text-gray-700 mb-2">
                          ⚠️LINEとの連携には、<strong style={{ color: 'red' }}>必ず次の設定をしてください</strong>
                        </p>
                        <div className="bg-white rounded border p-2 mb-2">
                          <p className="text-sm text-gray-600">
                            <strong>＜設定手順＞</strong><br />
                            1. 質問１のタイトル: 「LINE User ID」<br />
                            2. 質問１の回答形式: 記述式（短文）<br />
                            3. 質問１の必須: ON<br />（上部メールアドレス設定は任意）
                          </p>
                        </div>
                      </div>

                      <Button
                        onClick={() => { setIsAdmin(true), setIsTab('admin') }}
                        variant="default"
                        size="sm"
                        className="w-full text-green-700 border-blue-300 hover:bg-blue-700 mt-2 text-white"
                      >
                        準備完了！　はじめる
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
          {isTab === 'secret' && (
            <LineSettingsClient onClick={() => { setIsTab('admin'), setIsAdmin(true) }} login={relogin} />
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
            {notifyEnabled ?
              <div className="px-2">
                {isTab === "secret" ? (
                  <button className="rounded-full h-5 w-5 bg-primary" />
                ) : (
                  <button onClick={() => { setIsTab("secret"), setIsAdmin(false) }}>
                    <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                  </button>
                )}
              </div> : null}
            <div className="px-2">
              {isTab === "howto" ? (
                <button className="rounded-full h-5 w-5 bg-primary" />
              ) : (
                <button onClick={() => { setIsTab("howto"), setIsAdmin(false) }}>
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

        <ToastNotification message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
      </div>
    </>
  );
}
