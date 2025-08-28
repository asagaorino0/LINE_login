'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Github, Shield, HelpCircle, Copy } from "lucide-react";
import { liffManager, type LiffProfile } from "../lib/liff";
import { apiRequest } from "../lib/queryClient";
import { ToastNotification, useToastNotification } from "../components/ui/toast-notification";
import { GoogleFormsManager } from "../lib/googleForms";

export default function Home() {
  // ---------- UI / 状態 ----------
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<LiffProfile | null>(null);

  const [formUrl, setFormUrl] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isGeneratingUrl, setIsGeneratingUrl] = useState(false);

  const [detectedEntries, setDetectedEntries] = useState<{ userId?: string; message?: string } | null>(null);
  const [lastDetectionResult, setLastDetectionResult] = useState<{ userId: string; message?: string; formUrl: string } | null>(null);

  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null); // プリフィルURL
  const [formTitle, setFormTitle] = useState<string>("公式LINE連携_Googleフォーム");
  const [formDescription, setFormDescription] = useState<string>("リンクを開くにはこちらをタップ");

  const { toast, showToast, hideToast } = useToastNotification();

  // ref 制御
  const autoTriggeredRef = useRef(false);
  const messageSentRef = useRef(false);
  const redirectedRef = useRef(false);

  // ---------- URLパラメータ（?form=...） ----------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const formParam = params.get("form");
    if (formParam) {
      try {
        const decoded = decodeURIComponent(formParam);
        setFormUrl(decoded);
        setIsAutoMode(true);

        // 新しいリンクを踏んだときはフラグをリセット
        autoTriggeredRef.current = false;
        messageSentRef.current = false;
        redirectedRef.current = false;

        console.log("[auto] activated with form:", decoded);
      } catch (e) {
        console.error("Failed to parse URL parameters:", e);
      }
    }
  }, []);

  // ---------- LIFF初期化 ----------
  useEffect(() => {
    const init = async () => {
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
        console.error("LIFF initialization failed:", e);
        setError("LIFF初期化に失敗しました。ページをリロードしてください。");
      }
    };
    void init();
  }, []);

  // ---------- タイトル反映 ----------
  useEffect(() => {
    if (formTitle) document.title = formTitle;
  }, [formTitle]);

  // ---------- プリフィルURL生成 ----------
  useEffect(() => {
    const run = async () => {
      if (userProfile && formUrl && isAutoMode) {
        setIsGeneratingUrl(true);
        try {
          const url = await generatePrefillUrl(formUrl, userProfile.userId);
          setGeneratedUrl(url);
        } catch (e) {
          console.error("URL generation failed:", e);
          setGeneratedUrl(null);
        } finally {
          setIsGeneratingUrl(false);
        }
      } else {
        setGeneratedUrl(null);
        setIsGeneratingUrl(false);
      }
    };
    void run();
  }, [userProfile?.userId, formUrl, isAutoMode, lastDetectionResult?.userId, detectedEntries?.userId]);

  // ---------- 自動遷移（1回だけ） ----------
  useEffect(() => {
    if (isAutoMode && isLoggedIn && userProfile && generatedUrl && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      void sendLineMessageAndOpenForm({ manual: false });
    }
  }, [isAutoMode, isLoggedIn, userProfile?.userId, generatedUrl]);

  // ---------- helpers ----------
  const saveUserToBackend = async (profile: LiffProfile) => {
    try {
      await apiRequest("POST", "/api/line-users", {
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
      });
    } catch (e) {
      console.error("Failed to save user to backend:", e);
    }
  };

  const loginMutation = useMutation({
    mutationFn: async () => {
      const profile = await liffManager.login();
      await saveUserToBackend(profile);
      return profile;
    },
    onSuccess: (profile) => {
      setUserProfile(profile);
      setIsLoggedIn(true);
      setError(null);
    },
    onError: (e: Error) => {
      console.error("Login failed:", e);
      setError("ログインに失敗しました。もう一度お試しください。");
    },
  });

  const handleLineLogin = () => {
    if (!loginMutation.isPending) {
      setError(null);
      loginMutation.mutate();
    }
  };

  // ---------- Google Forms 解析 ----------
  const handleDetectEntries = async () => {
    if (!formUrl.trim()) {
      showToast("フォームURLを先に入力してください", "error");
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

        const detection = {
          userId: result.userId!,
          message: result.message,
          formUrl: normalized,
        };
        setDetectedEntries({ userId: result.userId, message: result.message });
        setLastDetectionResult(detection);
      } else {
        showToast(`検出に失敗しました: ${result.error}`, "error");
      }
    } catch (e) {
      console.error("Entry detection failed:", e);
      showToast("検出中にエラーが発生しました", "error");
    } finally {
      setIsDetecting(false);
    }
  };

  // ---------- プリフィルURL生成 ----------
  const generatePrefillUrl = async (originalUrl: string, userId: string): Promise<string> => {
    try {
      const baseUrl = originalUrl.split("?")[0];
      let userIdEntry =
        lastDetectionResult?.formUrl === originalUrl
          ? lastDetectionResult.userId
          : detectedEntries?.userId;

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
        } catch { }
      }

      userIdEntry = userIdEntry ?? "entry.1795297917";
      const prefillUrl = `${baseUrl}?usp=pp_url&${userIdEntry}=${encodeURIComponent(userId)}`;
      if (detectedEntries?.message) {
        return `${prefillUrl}&${detectedEntries.message}=`;
      }
      return prefillUrl;
    } catch {
      return originalUrl;
    }
  };

  // ---------- プレビューURL ----------
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
    if (!viewUrlNormalized) return "";
    return `${window.location.origin}/?form=${encodeURIComponent(viewUrlNormalized)}&redirect=true`;
  }, [viewUrlNormalized]);

  const previewUrl = useMemo(() => {
    if (!viewUrlNormalized) return "";
    const params = new URLSearchParams({
      form: viewUrlNormalized,
      title: formTitle || "",
      desc: formDescription || "リンクを開くにはこちらをタップ",
      v: String(Date.now()),
    });
    return `${window.location.origin}/api/link-preview?${params.toString()}`;
  }, [viewUrlNormalized, formTitle, formDescription]);

  // ---------- LINE送信 + 遷移 ----------
  const sendLineMessageAndOpenForm = async ({ manual = false }: { manual?: boolean }) => {
    if (!userProfile || !generatedUrl) return;

    // メッセージ送信：1回だけ
    if (!messageSentRef.current) {
      messageSentRef.current = true;
      apiRequest("POST", "/api/line/send-message", {
        userId: userProfile.userId,
        type: "card",
        formUrl: generatedUrl,
        title: formTitle || "Googleフォーム回答通知",
        description: formDescription || "リンクを開くにはこちらをタップ",
      }).catch((e) => console.warn("send-message failed:", e));
    }

    // 遷移：1回だけ
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      const go = () => window.location.replace(generatedUrl!);
      if (manual) {
        go();
      } else {
        setTimeout(go, 60); // iOS LINE 対策
      }
    }
  };

  const handleRetry = () => {
    setError(null);
    if (!isLoggedIn) handleLineLogin();
  };

  // ---------- UI ----------
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-line-green mx-auto mb-4"></div>
          <p className="text-gray-600">アプリを初期化中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 font-noto min-h-screen">
      {/* Header */}
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
                  {loginMutation.isPending ? "認証中..." : "LINEでログイン"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 自動モード：ログイン済み → フォームアクセス */}
        {isLoggedIn && userProfile && formUrl && isAutoMode && (
          isGeneratingUrl ? (
            <Card className="mb-6"><CardContent className="pt-6 text-center">URLを生成中...</CardContent></Card>
          ) : (
            <button
              onClick={() => sendLineMessageAndOpenForm({ manual: true })}
              disabled={!generatedUrl}
              className="w-full p-0 h-auto"
            >
              <p className="text-sm text-blue-800 mt-6">自動でフォームにアクセスしない時はここをクリック</p>
            </button>
          )
        )}

        {/* 管理者モード */}
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
                      <div className="relative">
                        <Input
                          type="url"
                          value={formUrl}
                          onChange={(e) => {
                            setFormUrl(e.target.value);
                            if (detectedEntries) setDetectedEntries(null);
                            if (lastDetectionResult) setLastDetectionResult(null);
                          }}
                          placeholder="GoogleフォームのURLを入力"
                          className="pr-5 text-gray-600 text-sm"
                        />
                      </div>

                      <Button
                        onClick={handleDetectEntries}
                        disabled={isDetecting}
                        variant={formUrl ? "default" : "outline"}
                        size="sm"
                        className="mt-2 w-full text-blue-900 border-blue-300 hover:bg-blue-50 mb-2"
                      >
                        {isDetecting ? "連携リンク生成中..." : "✨ 連携リンクを生成"}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div className="p-4 bg-green-50 rounded-lg border">
                        {detectedEntries && (
                          <h4 className="text-sm font-semibold text-green-800 mb-2">
                            連携リンクを生成しました。以下のリンクを
                          </h4>
                        )}
                        <h4 className="text-sm font-semibold text-green-800 mb-2">
                          GoogleフォームURLとしてご利用ください。
                        </h4>
                        <p className="text-xs text-green-700 mb-3">
                          フォームのデータが公式LINEで利用可能になります
                        </p>

                        <div className="bg-white rounded border p-3 mb-3">
                          <code className="text-xs font-mono text-gray-800 break-all">
                            {isDetecting ? "..." : (detectedEntries ? appUrl : "・・・")}
                          </code>
                        </div>
                      </div>

                      <Button
                        onClick={async () => {              // ← async にする
                          if (!formUrl) return;
                          const url = previewUrl || appUrl; // プレビュー差し替えURLを優先
                          try {
                            await navigator.clipboard.writeText(url); // 1回だけコピー
                            showToast("リンクをコピーしました", "success");
                          } catch {
                            showToast("コピーに失敗しました", "error");
                          }
                        }}
                        variant={detectedEntries ? "default" : "outline"}
                        size="sm"
                        className="w-full text-green-700 border-green-300 hover:bg-green-100 mt-2"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        リンクをコピー（LINE用プレビュー）
                      </Button>

                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-amber-50 rounded-lg mb-4">
                      <h5 className="text-xs font-semibold text-amber-800 mb-1">Googleフォーム側の重要な設定</h5>
                      <p className="text-xs text-amber-700 mb-2">
                        ⚠️LINEと連携するため、<strong style={{ color: "red" }}>必ず次の設定をしてください</strong>
                      </p>
                      <div className="bg-white rounded border p-2 mb-2">
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
                  <div className="rounded-full h-3 w-3 bg-primary"></div>
                ) : (
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white"></div>
                )}
              </button>
              <button onClick={() => setIsAdmin(true)} className="px-2">
                {!isAdmin ? (
                  <div className="rounded-full h-3 w-3 bg-primary"></div>
                ) : (
                  <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white"></div>
                )}
              </button>
            </div>
          </>
        )}
      </main>

      <footer className="max-w-md mx-auto px-4 py-6 text-center text-xs text-gray-500">
        © 2024 LINE UID Collection System
      </footer>

      <ToastNotification message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
    </div>
  );
}
