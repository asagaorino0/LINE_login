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

  // 署名付きリンク（配布用）
  const [signedLink, setSignedLink] = useState<string>("");
  const [basicId, setBasicId] = useState<string>("");

  const { toast, showToast, hideToast } = useToastNotification();
  const autoTriggeredRef = useRef(false);
  const messageSentRef = useRef(false);
  const navigatedRef = useRef(false);
  const linkCtxRef = useRef<{ lid?: string; aid?: string } | null>(null);
  const [cookieInfo, setCookieInfo] = useState<{ hasUid: boolean; uidMasked?: string } | null>(null);

  // どこかで一度だけ読み取る（isLoggedIn や isAdmin 変化時にも読むとわかりやすい）
  // 管理者ログイン後 or isAdmin 有効時に取得
  const firedAdminLoginRef = useRef(false);

  useEffect(() => {
    // userProfile.userId がまだ無い → 何もしない
    if (!userProfile?.userId) return;
    // すでに実行済みならスキップ
    if (firedAdminLoginRef.current) return;
    firedAdminLoginRef.current = true;
    // すでに送信中ならスキップ
    if (adminLoginMutation.isPending) return;
    // 実行！
    adminLoginMutation.mutate();
  }, [userProfile?.userId]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!userProfile?.userId) return; // ★ クッキー準備ができてから
    // if (!cookieInfo?.hasUid) return; // ★ クッキー準備ができてから

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

  // 初回ロードで lid を解決
  useEffect(() => {
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
  const adminLoginMutation = useMutation<LiffProfile, Error>({
    mutationFn: async () => {
      await liffManager.login();
      const profile = await liffManager.getProfile();
      if (!profile) throw new Error('Profile not available');

      // サーバーに userId を渡す
      await apiRequest("POST", "/api/line-admin", {
        lineUserId: profile.userId,   // ★ ここで渡す
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl ?? null,
      });
      return profile;
    },
    onSuccess: (profile) => {
      setUserProfile(profile);
      setIsLoggedIn(true);
      setError(null);
      // window.location.href = "/line-settings";
    },
    onError: (e) => {
      console.error("Admin login failed:", e);
      setError("管理者ログインに失敗しました。もう一度お試しください。");
    },
  });

  const handleAdminLogin = () => {
    if (!adminLoginMutation.isPending) {
      setError(null);
      adminLoginMutation.mutate();
    }
  };

  // ---- 署名付きリンク生成（管理画面のボタン）---------------------------
  const handleGenerateLink = async () => {
    if (!formUrl.trim()) {
      showToast("フォームURLを先に入力してください", "error");
      return;
    }
    setIsDetecting(true);
    setDetectedEntries(null);
    setLastDetectionResult(null);
    setSignedLink("");
    try {
      // 1) URL正規化 & 質問ID検出（タイトル/説明も取得）
      const normalized = viewUrlNormalized;
      let titleToSave = formTitle || "Googleフォーム";
      let descToSave = formDescription || "リンクを開くにはこちらをタップ";
      // 失敗しても致命的ではないので .catch(() => null)
      const result = await GoogleFormsManager.detectEntryIds(normalized).catch(() => null);
      if (result?.success) {
        if (result.title) titleToSave = result.title;
        if (result.description) descToSave = result.description;
        setDetectedEntries({ userId: result.userId, message: result.message });
        if (result.userId) {
          setLastDetectionResult({ userId: result.userId, message: result.message, formUrl: normalized });
        }
      } else if (result && !result.success) {
        showToast(`検出に失敗しました: ${result.error}`, "error");
      }
      // 画面表示用 state 更新（※POST に使う値は上のローカル変数を送る）
      setFormTitle(titleToSave);
      setFormDescription(descToSave);
      // 2) 署名付きリンク作成 API
      console.log(userProfile?.userId)
      // 送信直前に
      if (!userProfile?.userId) {
        showToast("LINEログイン後にお試しください（userId 未取得）", "error");
        return;
      }

      // const pickedBasicId = (selectedBasicId || basicId || "").trim();
      // // basicId を必須にしているなら
      // if (!pickedBasicId) {
      //   showToast("公式LINE（basicId）を選択してください", "error");
      //   return;
      // }

      // ここで payload を“undefined を含めない形”で組み立て
      const payload = {
        form: normalized,
        title: String(titleToSave ?? ""),
        desc: String(descToSave ?? ""),
        notify: notifyEnabled ? 1 : 0,
        aid: userProfile?.userId ?? null,
        ...(notifyEnabled ? { basicId: (selectedBasicId || basicId || "").trim() } : {}),
      };

      console.info("[handleGenerateLink] payload to /api/links:", payload);

      // const r = await fetch("/api/links", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(payload),
      // });


      // ★ notifyEnabled が ON のときだけ basicId を追加する
      if (notifyEnabled) {
        const pickedBasicId = (selectedBasicId || basicId || "").trim();
        if (!pickedBasicId) {
          showToast("公式LINE（basicId）を選択してください", "error");
          return;
        }
        payload.basicId = pickedBasicId;
      }


      const r = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await r.text();           // ← これ“だけ”で読む（1回だけ）
      let j: any = null;
      try { j = text ? JSON.parse(text) : null; } catch { /* 非JSON */ }

      if (!r.ok || !j?.ok) {
        const code = j?.code || "UNKNOWN";
        console.error("links-create error:", { status: r.status, code, detail: j ?? text });
        // …トーストなど
        //   return;
        // }

        // // const r = await fetch("/api/links", {
        // //   method: "POST",
        // //   headers: { "Content-Type": "application/json" },
        // //   credentials: "include", // ← 本番ドメインの uid クッキーが必須
        // //   body: JSON.stringify({
        // //     form: normalized,
        // //     title: titleToSave,
        // //     desc: descToSave,
        // //     notify: notifyEnabled ? 1 : 0,
        // //     basicId: selectedBasicId || basicId || null,
        // //     aid: userProfile?.userId
        // //   }),
        // // });
        // // 本文は一度だけ読んで安全に parse
        // const raw = await r.text();
        // let j: any = null;
        // try { j = raw ? JSON.parse(raw) : null; } catch { /* 非JSON */ }
        // // エラーハンドリングを明示的に
        // if (!r.ok || !j?.ok) {
        //   const code = j?.code || "UNKNOWN";
        //   console.error("links-create error:", { status: r.status, code, detail: j ?? raw });
        const msgMap: Record<string, string> = {
          NO_ADMIN_ID: "（本番ドメインで）管理者としてログインしてください。",
          BAD_FORM_URL: "フォームURLが正しくありません。",
          NO_FORM: "フォームURLを入力してください。",
        };
        showToast(msgMap[code] || `エラー: ${code}（${r.status}）`, "error");
        return;
      }
      // if (!r.ok || !j?.ok) {
      //   const code = j?.code || "UNKNOWN";
      //   console.error("links-create error:", { status: r.status, code, detail: j ?? raw });
      //   const msgMap: Record<string, string> = {
      //     NO_ADMIN_ID: "（本番ドメインで）管理者としてログインしてください。",
      //     BAD_FORM_URL: "フォームURLが正しくありません。",
      //     NO_FORM: "フォームURLを入力してください。",
      //   };
      //   showToast(msgMap[code] || `エラー: ${code}（${r.status}）`, "error");
      //   return;
      // }
      // 成功
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
                            setSignedLink("");
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
                          onClick={handleGenerateLink}
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
                          {signedLink && (
                            <h4 className="text-sm font-semibold text-green-800 mb-2">
                              連携リンクを生成しました。以下のリンクを GoogleフォームURL としてご利用ください。
                            </h4>
                          )}
                          {!signedLink && (
                            <h4 className="text-sm font-semibold text-green-800 mb-2">
                              連携リンク（署名付き）を生成すると、ここに表示されます。
                            </h4>
                          )}
                          <p className="text-xs text-green-700 mb-3">フォームのデータが公式LINEで利用可能になります</p>
                          <div className="bg-white rounded border p-3 mb-3">
                            <code className="text-xs font-mono text-gray-800 break-all">
                              {isDetecting ? '...' : (signedLink || '・・・')}
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
                          className="mt-2 w-full text-blue-900 border-blue-300 hover:bg-blue-50 mb-2"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          リンクをコピー
                        </Button>
                        <div className="text-xs text-gray-500 space-y-1 mb-2">
                          <div>LIFF UID: {userProfile?.userId ?? "—(未ログイン)"}</div>
                          <div>cookie uid: {cookieInfo?.hasUid ? cookieInfo.uidMasked : "—(未セット)"}</div>
                        </div>
                        {/* 管理者モードのフォーム内 どこか適切な場所に */}
                        <div className="mt-3">
                          <label className="text-sm text-gray-700">送信に使う公式LINE</label>
                          <select
                            value={selectedBasicId}                             // "" or "@xxxx"
                            onChange={(e) => { setSelectedBasicId(e.target.value), setBasicId(e.target.value) }}
                          >
                            {!accounts.length && <option value="">（未登録）</option>}
                            {accounts.map(a => (
                              <option key={a.basicId} value={a.basicId}>
                                {(a.channelName || a.basicId)}
                                {/* （{a.basicId}） */}
                              </option>
                            ))}
                          </select>
                          {!accounts.length && (
                            <p className="text-xs text-amber-700 mt-1">
                              まず「管理者としてログイン」→ 設定ページで資格を登録してください。
                            </p>
                          )}
                        </div>
                      </div>

                      {notifyEnabled && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-800 mb-3">フォーム回答通知機能</h4>
                          <div className="space-y-2">
                            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                              回答通知を受け取るには、公式LINEの設定が必要です
                            </p>
                            <Button
                              onClick={() =>
                                // handleAdminLogin
                                window.location.href = "/line-settings"
                              }
                              disabled={loginMutation.isPending}
                              className="w-full bg-line-green hover:bg-line-brand text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 min-h-[48px]"
                              data-testid="button-line-login"
                            >
                              {loginMutation.isPending ? '認証中...' : '通知設定画面へ'}
                            </Button>
                          </div>
                        </div>
                      )}
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
    </>
  );
}
