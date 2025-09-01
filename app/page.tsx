'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Github, Shield, HelpCircle, Copy, Settings } from 'lucide-react';
import { ToastNotification, useToastNotification } from '../components/ui/toast-notification';

// B) 相対パスで app 配下を指す
// import { liffManager, type LiffProfile } from './lib/liff';
import { apiRequest } from './lib/queryClient';
import { GoogleFormsManager } from './lib/googleForms';
import { liffManager, LiffProfile } from '@/lib/liff';

export default function Home() {
  // ---- state -------------------------------------------------------------
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<LiffProfile | null>(null);

  const [formUrl, setFormUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isGeneratingUrl, setIsGeneratingUrl] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const [detectedEntries, setDetectedEntries] = useState<{ userId?: string; message?: string } | null>(null);
  const [lastDetectionResult, setLastDetectionResult] = useState<{ userId: string; message?: string; formUrl: string } | null>(null);

  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('公式LINE連携_Googleフォーム');
  const [formDescription, setFormDescription] = useState('リンクを開くにはこちらをタップ');
  const [notifyEnabled, setNotifyEnabled] = useState(true);

  const { toast, showToast, hideToast } = useToastNotification();
  const autoTriggeredRef = useRef(false);
  const messageSentRef = useRef(false);
  const navigatedRef = useRef(false);

  // ---- params ------------------------------------------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const formParam = params.get('form');
    const notifyParam = params.get('notify');

    if (formParam) {
      try {
        const decoded = decodeURIComponent(formParam);
        setFormUrl(decoded);
        setIsAutoMode(true);
        // 自動発火フラグをリセット
        autoTriggeredRef.current = false;
        messageSentRef.current = false;
        navigatedRef.current = false;
        console.log('[auto] activated with form:', decoded);
      } catch (e) {
        console.error('Failed to parse URL parameters:', e);
      }
    }
    if (notifyParam === '0') setNotifyEnabled(false);
    if (notifyParam === '1') setNotifyEnabled(true);
  }, []);

  // ---- LIFF init ---------------------------------------------------------
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

  // ---- prefill URL generation -------------------------------------------
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
  }, [userProfile?.userId, formUrl, isAutoMode, lastDetectionResult?.userId, detectedEntries?.userId]);

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

  // ✅ 修正：login() は未ログイン時はリダイレクトで終わるので、戻り値を期待しない
  // const loginMutation = useMutation({
  //   mutationFn: async () => {
  //     await liffManager.login();               // 未ログインならここでリダイレクトして処理終了
  //     const profile = await liffManager.getProfile(); // ログイン“済み”の場合のみ続行
  //     await saveUserToBackend(profile);
  //     return profile;
  //   },
  //   onSuccess: (profile) => {
  //     setUserProfile(profile);
  //     setIsLoggedIn(true);
  //     setError(null);
  //   },
  //   onError: (e: Error) => {
  //     console.error('Login failed:', e);
  //     setError('ログインに失敗しました。もう一度お試しください。');
  //   },
  // });

  const handleLineLogin = () => {
    if (!loginMutation.isPending) {
      setError(null);
      loginMutation.mutate();
    }
  };
  const loginMutation = useMutation<LiffProfile, Error>({
    mutationFn: async () => {
      await liffManager.login();                 // 未ログインならここで遷移して戻らない
      const profile = await liffManager.getProfile();
      if (!profile) throw new Error('Profile not available'); // ここで絞り込み
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


  const adminLoginMutation = useMutation<LiffProfile, Error>({
    mutationFn: async () => {
      await liffManager.login();
      const profile = await liffManager.getProfile();
      if (!profile) throw new Error('Profile not available'); // ← 同様に
      await saveAdminToBackend(profile);
      return profile;
    },
    onSuccess: (profile) => {
      setUserProfile(profile);
      setIsLoggedIn(true);
      setError(null);
      window.location.href = "/line-settings";
    },
    onError: (e) => {
      console.error("Admin login failed:", e);
      setError("管理者ログインに失敗しました。もう一度お試しください。");
    },
  });

  // 管理者ログイン時のみ使う保存関数
  const saveAdminToBackend = async (profile: LiffProfile) => {
    await apiRequest("POST", "/api/line-admin", {
      lineUserId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl ?? null,
    });
  };

  // ✅ 管理者ログインも同様に修正
  // const adminLoginMutation = useMutation({
  //   mutationFn: async () => {
  //     await liffManager.login();
  //     const profile = await liffManager.getProfile();
  //     await saveAdminToBackend(profile);
  //     return profile;
  //   },
  //   onSuccess: (profile) => {
  //     setUserProfile(profile);
  //     setIsLoggedIn(true);
  //     setError(null);
  //     window.location.href = "/line-settings";
  //   },
  //   onError: (e: Error) => {
  //     console.error("Admin login failed:", e);
  //     setError("管理者ログインに失敗しました。もう一度お試しください。");
  //   },
  // });

  const handleAdminLogin = () => {
    if (!adminLoginMutation.isPending) {
      setError(null);
      adminLoginMutation.mutate();
    }
  };

  // ---- detect entry ids --------------------------------------------------
  const handleDetectEntries = async () => {
    if (!formUrl.trim()) {
      showToast('フォームURLを先に入力してください', 'error');
      return;
    }
    setIsDetecting(true);
    setDetectedEntries(null);
    setLastDetectionResult(null);
    try {
      const normalized = (GoogleFormsManager as any).normalizeFormUrl
        ? (GoogleFormsManager as any).normalizeFormUrl(formUrl)
        : formUrl;

      const result = await GoogleFormsManager.detectEntryIds(normalized);
      if (result.success) {
        if (result.title) setFormTitle(result.title);
        if (result.description) setFormDescription(result.description);
        setDetectedEntries({ userId: result.userId, message: result.message });
        setLastDetectionResult({ userId: result.userId!, message: result.message, formUrl: normalized });
      } else {
        showToast(`検出に失敗しました: ${result.error}`, 'error');
      }
    } catch (e) {
      // /api/forms/inspect が 404 でも致命ではないので握りつぶす
      console.warn('Entry detection fallback:', e);
      showToast('検出中にエラーが発生しました', 'error');
    } finally {
      setIsDetecting(false);
    }
  };

  // ---- prefill url builder ----------------------------------------------
  const generatePrefillUrl = async (originalUrl: string, userId: string): Promise<string> => {
    try {
      const baseUrl = originalUrl.split('?')[0];

      let userIdEntry =
        lastDetectionResult?.formUrl === originalUrl ? lastDetectionResult.userId : detectedEntries?.userId;

      if (!userIdEntry) {
        try {
          const detection = await GoogleFormsManager.detectEntryIds(originalUrl);
          if (detection.success && detection.userId) {
            userIdEntry = detection.userId;
            setLastDetectionResult({ userId: detection.userId, message: detection.message, formUrl: originalUrl });
            setDetectedEntries({ userId: detection.userId, message: detection.message });
            if (detection.title) setFormTitle(detection.title);
            if (detection.description) setFormDescription(detection.description);
          }
        } catch {
          /* noop（404等は無視） */
        }
      }

      userIdEntry = userIdEntry ?? 'entry.1795297917';

      const prefillUrl = `${baseUrl}?usp=pp_url&${userIdEntry}=${encodeURIComponent(userId)}`;
      if (detectedEntries?.message) return `${prefillUrl}&${detectedEntries.message}=`;
      return prefillUrl;
    } catch (e) {
      console.error('Failed to generate prefill URL:', e);
      return originalUrl;
    }
  };

  // ---- derived urls ------------------------------------------------------
  const viewUrlNormalized = useMemo(() => {
    try {
      return (GoogleFormsManager as any).normalizeFormUrl
        ? (GoogleFormsManager as any).normalizeFormUrl(formUrl)
        : formUrl;
    } catch {
      return formUrl;
    }
  }, [formUrl]);

  const appUrl = useMemo(() => {
    if (!viewUrlNormalized) return '';
    const notify = notifyEnabled ? '1' : '0';
    return `${window.location.origin}/?form=${encodeURIComponent(viewUrlNormalized)}&redirect=true&notify=${notify}`;
  }, [viewUrlNormalized, notifyEnabled]);

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
  // 送信 & フォーム遷移
  const sendLineMessageAndOpenForm = async (manual: boolean) => {
    if (!userProfile || !generatedUrl) return;
    if (!messageSentRef.current && notifyEnabled) {
      messageSentRef.current = true;
      const payload = {
        userId: userProfile.userId,
        type: "card" as const,
        formUrl: generatedUrl,
        title: formTitle || "Googleフォーム回答通知",
        description: formDescription || "リンクを開くにはこちらをタップ",
      };
      // 1) ページ遷移中断対策：sendBeacon > keepalive fetch の順でトライ
      try {
        let sent = false;
        if ("sendBeacon" in navigator) {
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          sent = navigator.sendBeacon("/api/line", blob);
        }
        if (!sent) {
          await fetch("/api/line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            // ページ遷移が始まっても送信を継続
            keepalive: true,
          }).catch((e) => console.warn("send-message failed (keepalive):", e));
        }
      } catch (e) {
        console.warn("send-message failed:", e);
      }
    }
    // フォームへ遷移
    if (!navigatedRef.current) {
      navigatedRef.current = true;
      const go = () => window.location.replace(generatedUrl);
      // 送信の猶予を少し長めに。60ms → 250ms
      if (manual) go();
      else setTimeout(go, 250);
    }
  };


  // ---- UI ---------------------------------------------------------------
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

  const handleLineSettings = () => {
    console.log('LINE Settings button clicked');
    window.location.href = '/line-settings';
  };

  return (
    <div className="bg-gray-50 font-noto min-h-screen">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-900">Googleフォーム-LINE連携システム</h1>
            <div className="text-sm text-gray-500">v1.0</div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
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
                <span className="text-blue-600">URLを生成中...</span>
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
        {!isAutoMode && (
          <>
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">管理者モード</h3>
                </div>

                {isAdmin ? (
                  <div className="space-y-4">
                    <div>
                      <Input
                        type="url"
                        value={formUrl}
                        onChange={(e) => {
                          setFormUrl(e.target.value);
                          if (detectedEntries) setDetectedEntries(null);
                          if (lastDetectionResult) setLastDetectionResult(null);
                        }}
                        placeholder="ここにGoogleフォームのURLを入力"
                        className="pr-5 text-gray-600 text-sm"
                      />

                      <div className="mt-3 flex items-center space-x-2">
                        <input
                          id="notify"
                          type="checkbox"
                          checked={notifyEnabled}
                          onChange={(e) => setNotifyEnabled(e.target.checked)}
                          className="h-4 w-4 text-green-600 border-gray-300 rounded"
                        />
                        <label htmlFor="notify" className="text-sm text-gray-700">
                          回答通知をLINEに送信する
                        </label>
                      </div>

                      <Button
                        onClick={handleDetectEntries}
                        disabled={isDetecting}
                        variant={formUrl ? 'default' : 'outline'}
                        size="sm"
                        className="mt-2 w-full text-blue-900 border-blue-300 hover:bg-blue-50 mb-2"
                      >
                        {isDetecting ? '連携リンク生成中...' : '✨ 連携リンクを生成'}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div className="p-4 bg-green-50 rounded-lg border">
                        {detectedEntries && (
                          <h4 className="text-sm font-semibold text-green-800 mb-2">連携リンクを生成しました。以下のリンクを</h4>
                        )}
                        <h4 className="text-sm font-semibold text-green-800 mb-2">GoogleフォームURLとしてご利用ください。</h4>
                        <p className="text-xs text-green-700 mb-3">フォームのデータが公式LINEで利用可能になります</p>

                        <div className="bg-white rounded border p-3 mb-3">
                          <code className="text-xs font-mono text-gray-800 break-all">
                            {isDetecting ? '...' : detectedEntries ? appUrl : '・・・'}
                          </code>
                        </div>
                      </div>

                      <Button
                        onClick={async () => {
                          if (!formUrl) return;
                          const url = previewUrl || appUrl;
                          try {
                            await navigator.clipboard.writeText(url);
                            showToast('リンクをコピーしました', 'success');
                          } catch {
                            showToast('コピーに失敗しました', 'error');
                          }
                        }}
                        variant={detectedEntries ? 'default' : 'outline'}
                        size="sm"
                        className="mt-2 w-full text-blue-900 border-blue-300 hover:bg-blue-50 mb-2"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        リンクをコピー
                      </Button>
                    </div>

                    {notifyEnabled &&
                      <>
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-800 mb-3">フォーム回答通知機能</h4>
                          <div className="space-y-2">
                            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                              回答通知を受け取るには、公式LINEの設定が必要です
                            </p>
                            <Button
                              onClick={handleAdminLogin}
                              disabled={loginMutation.isPending}
                              className="w-full bg-line-green hover:bg-line-brand text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 min-h-[48px]"
                              data-testid="button-line-login"
                            >
                              {loginMutation.isPending ? '認証中...' : '管理者としてログイン'}
                            </Button>
                            {/* <Button
                                onClick={handleLineSettings}
                                variant="outline"
                                className="w-full justify-start"
                              >
                                <Settings className="w-4 h-4 mr-2" />
                                LINE API設定
                              </Button> */}
                          </div>
                        </div>
                        {/* <a href="https://account.line.biz/login">LINEビジネス</a> */}
                      </>
                    }
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-amber-50 rounded-lg mb-4">
                      <h5 className="text-xs font-semibold text-amber-800 mb-1">Googleフォーム側の重要な設定</h5>
                      <p className="text-xs text-amber-700 mb-2">
                        ⚠️LINEと連携するため、<strong style={{ color: 'red' }}>必ず次の設定をしてください</strong>
                      </p>
                      <div className="bg白 rounded border p-2 mb-2">
                        <p className="text-xs text-gray-600">
                          📝 <strong>設定手順：</strong><br />
                          1. 質問１のタイトル: 「LINE User ID」<br />
                          2. 質問１の回答形式: 記述式（短文）<br />
                          3. 質問１の必須: ON（メールアドレス設定は任意）
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={() => setIsAdmin(true)}
                      variant="default"
                      size="sm"
                      className="w-full text-green-700 border-green-300 hover:bg-green-100 mt-2 text-white"
                    >
                      はじめる
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-row justify-center m-4">
              <button onClick={() => setIsAdmin(false)} className="px-2">
                {isAdmin ? (
                  <div className="rounded-full h-3 w-3 bg-primary" />
                ) : (
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                )}
              </button>
              <button onClick={() => setIsAdmin(true)} className="px-2">
                {!isAdmin ? (
                  <div className="rounded-full h-3 w-3 bg-primary" />
                ) : (
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white" />
                )}
              </button>
            </div>
          </>
        )}
      </main>

      <footer className="max-w-md mx-auto px-4 py-6 text-center">
        <div className="text-xs text-gray-500 space-y-2">
          <p>© 2024 LINE UID Collection System</p>
          <div className="flex items-center justify-center space-x-4">
            <a
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
            </a>
          </div>
        </div>
      </footer>

      <ToastNotification message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
    </div>
  );
}
