'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Github, Shield, HelpCircle, Copy } from 'lucide-react';
import { ToastNotification, useToastNotification } from '../components/ui/toast-notification';

import { apiRequest } from './lib/queryClient';
import { GoogleFormsManager } from './lib/googleForms';
import { liffManager, LiffProfile } from '@/lib/liff';
import HomeClient from './(public)/HomeClient';
import LineSettingsClient from './line-settings/client';
import Howto from './line-settings/howto';

export default function Home() {
  type Account = {
    basicId: string;            // ここは必ず string（空文字を許容）にする
    channelName?: string;
    channelId?: string;
  };

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBasicId, setSelectedBasicId] = useState<string>("");

  // ---- state -------------------------------------------------------------
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<LiffProfile | null>(null);

  const [formUrl, setFormUrl] = useState('');
  const [isTab, setIsTab] = useState<'top' | 'secret' | 'admin' | 'howto'>('top')
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isGeneratingUrl, setIsGeneratingUrl] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const [detectedEntries, setDetectedEntries] = useState<{ userId?: string; message?: string } | null>(null);
  const [lastDetectionResult, setLastDetectionResult] = useState<{ userId: string; message?: string; formUrl: string } | null>(null);

  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('公式LINE連携_Googleフォーム');
  const [formDescription, setFormDescription] = useState('リンクを開くにはこちらをタップ');
  const [formBgcolor, setFormBgcolor] = useState('#555555');
  const [notifyEnabled, setNotifyEnabled] = useState(false);

  // 署名付きリンク（配布用）
  const [signedLink, setSignedLink] = useState<string>("");
  const [basicId, setBasicId] = useState<string>("");

  const { toast, showToast, hideToast } = useToastNotification();
  const autoTriggeredRef = useRef(false);
  const messageSentRef = useRef(false);
  const navigatedRef = useRef(false);
  const linkCtxRef = useRef<{ lid?: string; aid?: string } | null>(null);
  const [cookieInfo, setCookieInfo] = useState<{ hasUid: boolean; uidMasked?: string } | null>(null);

  const [fingerprints, setFingerprints] = useState<{ liffId?: string; channelSecret?: string; channelAccessToken?: string } | null>(null);
  // 管理者ログイン後 or isAdmin 有効時に取得
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/line-secrets", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.exists)
            setFingerprints(j.fingerprints ?? null);
        }
      } catch { }
    })();
  }, []);

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

  useEffect(() => {
    if (isTab === "top") return;
    if (!userProfile?.userId) return; // ★ クッキー準備ができてから
    if (!cookieInfo?.hasUid) return; // ★ クッキー準備ができてから
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
  // }, [isAdmin, cookieInfo?.hasUid]);

  useEffect(() => {
    fetch("/api/whoami", { credentials: "include", cache: "no-store" })
      .then(r => r.json())
      .then(j => setCookieInfo(j))
      .catch(() => setCookieInfo(null));
  }, [isLoggedIn, isAdmin]);

  // 初回ロードで lid を解決（/open ページ以外の場合のみ）
  useEffect(() => {
    // /open ページの場合はスキップ（OpenFormClient が処理するため）
    if (window.location.pathname === '/open') return;

    const sp = new URLSearchParams(window.location.search);
    const lid = sp.get("lid");
    const formParam = sp.get("form");         // ←従来方式も残す
    const notifyParam = sp.get("notify");
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
  }, []);


  // ---- LIFF init ---------------------------------------------------------
  const relogin = async () => {
    try {
      await liffManager.init();
      // いったんログアウト
      if (liffManager.isLoggedIn()) {
        liffManager.logout();
      }
      // 再ログイン（このとき LINE アカウント選択が出る）
      await liffManager.login();
      // ログイン後にプロフィール取得
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

  // ---- prefill URL generation（自動モード用） ----------------------------
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

  // const adminLoginMutation = useMutation<LiffProfile, Error>({
  //   mutationFn: async () => {
  //     await liffManager.login();
  //     const profile = await liffManager.getProfile();
  //     if (!profile) throw new Error('Profile not available');
  //     // サーバ側で uid クッキーをセット
  //     await apiRequest("POST", "/api/line-admin", {
  //       lineUserId: profile.userId,
  //       displayName: profile.displayName,
  //       pictureUrl: profile.pictureUrl ?? null,
  //     });
  //     return profile;
  //   },
  //   onSuccess: (profile) => {
  //     setUserProfile(profile);
  //     setIsLoggedIn(true);
  //     setError(null);
  //     window.location.href = "/line-settings";
  //   },
  //   onError: (e) => {
  //     console.error("Admin login failed:", e);
  //     setError("管理者ログインに失敗しました。もう一度お試しください。");
  //   },
  // });

  // const adminLoginMutation = useMutation<LiffProfile, Error>({
  //   mutationFn: async () => {
  //     await liffManager.login();
  //     const profile = await liffManager.getProfile();
  //     if (!profile) throw new Error('Profile not available');

  //     // サーバーに userId を渡す
  //     await apiRequest("POST", "/api/line-admin", {
  //       lineUserId: profile.userId,   // ★ ここで渡す
  //       displayName: profile.displayName,
  //       pictureUrl: profile.pictureUrl ?? null,
  //     });
  //     return profile;
  //   },
  //   onSuccess: (profile) => {
  //     setUserProfile(profile);
  //     setIsLoggedIn(true);
  //     setError(null);
  //     // window.location.href = "/line-settings";
  //   },
  //   onError: (e) => {
  //     console.error("Admin login failed:", e);
  //     setError("管理者ログインに失敗しました。もう一度お試しください。");
  //   },
  // });

  // const handleAdminLogin = () => {
  //   if (!adminLoginMutation.isPending) {
  //     setError(null);
  //     adminLoginMutation.mutate();
  //   }
  // };

  // ---- 署名付きリンク生成（管理画面のボタン）---------------------------
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
    setDetectedEntries(null);
    setLastDetectionResult(null);
    setSignedLink("");
    try {
      // 1) URL正規化 & 質問ID検出（失敗は致命的ではない）
      const normalized = viewUrlNormalized;
      let nextTitle = formTitle || "Googleフォーム";
      let nextDesc = formDescription || "リンクを開くにはこちらをタップ";
      let nextBgcolor = formBgcolor || "#555555";
      try {
        const result = await GoogleFormsManager.detectEntryIds(normalized);
        if (result?.success) {
          if (result.pageBackgroundColor) nextBgcolor = result.pageBackgroundColor
          if (result.title) nextTitle = result.title;
          if (result.description) nextDesc = result.description;
          setDetectedEntries({ userId: result.userId, message: result.message });
          if (result.userId) {
            setLastDetectionResult({ userId: result.userId, message: result.message, formUrl: normalized });
          }
        } else if (result && !result.success) {
          showToast(`検出に失敗しました: ${result.error}`, "error");
        }
      } catch { /* ignore detection failure */ }
      // 画面表示用 state 更新
      setFormTitle(nextTitle);
      setFormDescription(nextDesc);
      setFormBgcolor(nextBgcolor)
      // 2) payload を “undefined を含めない” 形で構築
      const payload: Record<string, any> = {
        form: normalized,
        title: String(nextTitle ?? ""),
        desc: String(nextDesc ?? ""),
        notify: notifyEnabled ? 1 : 0,
        bgcolor: nextBgcolor
        // aid: userProfile!.userId, // ← 必ず string
      };
      // 通知ONのときだけ basicId を付ける
      if (payload.notify === 1) {
        const picked = (selectedBasicId || basicId || "").trim();
        if (!picked) {
          showToast("公式LINE（basicId）を選択してください", "error");
          return;
        }
        payload.basicId = picked;
      }
      const r = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      let j: any = null;
      try { j = text ? JSON.parse(text) : null; } catch { }
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
      // 4) 成功
      setSignedLink(j.link);
      showToast("連携リンクを生成しました", "success");
    } catch (e) {
      console.error("generate link failed:", e);
      showToast("連携リンク生成でエラーが発生しました", "error");
    } finally {
      setIsDetecting(false);
    }
  };



  // ---- prefill url builder（自動モードで使う） --------------------------
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
        } catch { /* noop */ }
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
    const lid = qs.get("lid") || "";                 // ★ 追加：lid を読む
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
        title: formTitle || "Googleフォーム",      // ← 既存
        desc: formDescription || "フォームに回答してください。", // ← 追加
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
          // 失敗時はユーザーにも見えるように
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

    // ★ デバッグ時は遷移しない
    if (!debug && !navigatedRef.current) {
      navigatedRef.current = true;
      const go = () => window.location.replace(generatedUrl);
      if (manual) go(); else setTimeout(go, 250);
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
                            if (detectedEntries) setDetectedEntries(null);
                            if (lastDetectionResult) setLastDetectionResult(null);
                            setSignedLink("");
                          }}
                          placeholder="ここにGoogleフォームのURLを入力"
                          className="pr-5 text-gray-500 text-sm bg-blue-200"
                        />

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
                              value={selectedBasicId} // "" or "@xxxx"
                              onChange={(e) => { setSelectedBasicId(e.target.value), setBasicId(e.target.value); }}
                            >
                              {!accounts.length && <option value="">（未登録）</option>}
                              {accounts.map((a) => {
                                const text = (a.channelName || a.basicId);
                                const fontSize = text.length > 20 ? "12px" : "14px"; // 例: 20文字以上なら小さめに
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
                            className="mt-2 w-full text-white border-blue-300 hover:bg-blue-50 mb-2"
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
                              {signedLink && (
                                <h4 className="text-xs text-gray-800 mb-2">
                                  連携リンクを生成しました。以下のリンクを <strong>GoogleフォームURL</strong>としてご利用ください。
                                </h4>
                              )}
                              {/* <p className="text-xs text-green-700 mb-3">フォームのデータが公式LINEで利用可能になります</p> */}
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
                                className="mt-2 w-full text-white border-blue-300 hover:bg-blue-50 mb-2"
                              >
                                <Copy className="w-3 h-3 mr-1" />
                                リンクをコピー
                              </Button>
                              : '未ログイン'}
                          </>
                        }
                        {/* <div className="text-xs text-gray-500 space-y-1 mb-2">
                          <div>LIFF UID: {userProfile?.userId ?? "—(未ログイン)"}</div>
                          <div>cookie uid: {cookieInfo?.hasUid ? cookieInfo.uidMasked : "—(未セット)"}</div>
                        </div> */}
                      </div>
                      {notifyEnabled && (
                        <>
                          <div className="border-t pt-4">
                            {/* <h4 className="text-sm font-semibold text-gray-800 mb-3">フォーム回答通知機能</h4> */}
                            <div className="space-y-2">
                              <p
                                style={{ color: !accounts.length ? "red" : "" }}
                                className="text-gray-600 mb-6 text-xs leading-relaxed">
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
                                // className="w-full bg-line-green hover:bg-line-brand text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 min-h-[48px]"
                                data-testid="button-line-login"
                              >
                                {loginMutation.isPending ? '認証中...' : 'フォーム回答通知機能 設定画面へ'}
                              </Button>
                            </div>
                          </div></>
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
