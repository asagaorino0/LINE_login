'use client';

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { RefreshCw, Github, Shield, HelpCircle, Copy } from "lucide-react";
import { liffManager, type LiffProfile } from "../lib/liff";
import { apiRequest } from "../lib/queryClient";
import { ToastNotification, useToastNotification } from "../components/ui/toast-notification";
import { GoogleFormsManager } from "../lib/googleForms";

export default function Home() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<LiffProfile | null>(null);
  const [formUrl, setFormUrl] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedEntries, setDetectedEntries] = useState<{ userId?: string; message?: string } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastDetectionResult, setLastDetectionResult] = useState<{ userId: string; message?: string; formUrl: string } | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [isGeneratingUrl, setIsGeneratingUrl] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const { toast, showToast, hideToast } = useToastNotification();
  const autoTriggeredRef = useRef(false);
  const [formTitle, setFormTitle] = useState<string>("公式LINE連携_Googleフォーム");
  const [formDescription, setFormDescription] = useState<string>("");




  /** 1) URL パラメータ取得は1箇所に統合 */
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const formParam = urlParams.get("form");
    if (formParam) {
      try {
        const decodedFormUrl = decodeURIComponent(formParam);
        setFormUrl(decodedFormUrl);
        setIsAutoMode(true);
        autoTriggeredRef.current = false; // 新しいURL受信時は自動発火をリセット
        console.log("[auto] activated with form:", decodedFormUrl);
      } catch (e) {
        console.error("Failed to parse URL parameters:", e);
      }
    }
  }, []);

  /** 2) LIFF 初期化 & 既ログイン確認（任意：自動ログインを有効化するならコメント解除） */
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liffManager.init();
        setIsInitialized(true);
        // Check if already logged in
        if (liffManager.isLoggedIn()) {
          const profile = await liffManager.getProfile();
          if (profile) {
            setUserProfile(profile);
            setIsLoggedIn(true);
            await saveUserToBackend(profile);
          }
        }

        // ▼【任意】自動ログイン：autoモードで未ログインなら自動で login()
        // if (!liffManager.isLoggedIn() && isAutoMode) {
        //   try {
        //     const profile = await liffManager.login();
        //     setUserProfile(profile);
        //     setIsLoggedIn(true);
        //     await saveUserToBackend(profile);
        //   } catch (e) {
        //     console.error("Auto login failed:", e);
        //   }
        // }
      } catch (e) {
        console.error("LIFF initialization failed:", e);
        setError("LIFF初期化に失敗しました。ページをリロードしてください。");
      }
    };
    initLiff();
    // isAutoMode を依存にすると初期化を再実行してしまうので入れない
  }, []);

  /** 3) ユーザー＆URL準備ができたらプリフィルURL生成 */
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
    run();
  }, [userProfile, formUrl, isAutoMode, lastDetectionResult, detectedEntries]);

  /** 4) 自動オープン：条件がそろったら1回だけ発火 */
  useEffect(() => {
    if (isAutoMode && isLoggedIn && userProfile && generatedUrl && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true; // 二重発火防止
      void sendLineMessageAndOpenForm(); // “火と忘れ”で呼ぶ
    }
  }, [isAutoMode, isLoggedIn, userProfile?.userId, generatedUrl]);

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
    if (loginMutation.isPending) return;
    setError(null);
    loginMutation.mutate();
  };

  /** Google Forms の entry ID 検出 */
  const handleDetectEntries = async () => {
    if (!formUrl.trim()) {
      showToast("フォームURLを先に入力してください", "error");
      return;
    }
    setIsDetecting(true);
    setDetectedEntries(null);
    setLastDetectionResult(null);
    try {
      const result = await GoogleFormsManager.detectEntryIds(formUrl);
      if (result.success) {
        console.log("📋 Googleフォームタイトル:", result.title);
        if (result.title) {
          setFormTitle(result.title); // ★ここで保存
        }
        if (result.description) {
          setFormDescription(result.description); // ★ここで保存
        }
        const detectionResult = {
          userId: result.userId!,
          message: result.message,
          formUrl,
        };
        setDetectedEntries({ userId: result.userId, message: result.message });
        setLastDetectionResult(detectionResult);
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
  useEffect(() => {
    if (formTitle) {
      document.title = formTitle;  // head の <title> を変更
    }
  }, [formTitle]);



  /** プリフィルURL生成（C: entry ID フォールバックを必ず入れる） */
  const generatePrefillUrl = async (originalUrl: string, userId: string): Promise<string> => {
    try {
      const baseUrl = originalUrl.split("?")[0];

      // 最優先：直近の検出結果（同じフォームURL）
      let userIdEntry = lastDetectionResult?.formUrl === originalUrl
        ? lastDetectionResult.userId
        : detectedEntries?.userId;

      // 自動検出の最終チャレンジ
      if (!userIdEntry) {
        try {
          const detection = await GoogleFormsManager.detectEntryIds(originalUrl);
          if (detection.success && detection.userId) {
            userIdEntry = detection.userId;
            setLastDetectionResult({ userId: detection.userId, message: detection.message, formUrl: originalUrl });
            setDetectedEntries({ userId: detection.userId, message: detection.message });
          }
        } catch { /* noop */ }
      }

      // フォールバック（フォームにより異なるが“空で壊れる”のを防止）
      userIdEntry = userIdEntry ?? "entry.1795297917";

      const prefillUrl = `${baseUrl}?usp=pp_url&${userIdEntry}=${encodeURIComponent(userId)}`;
      if (detectedEntries?.message) {
        return `${prefillUrl}&${detectedEntries.message}=`;
      }
      return prefillUrl;
    } catch (e) {
      console.error("Failed to generate prefill URL:", e);
      return originalUrl;
    }
  };

  /** A: フォームは必ず開く（送信は“火と忘れ”） */
  const sendLineMessageAndOpenForm = async () => {
    if (!userProfile || !generatedUrl) return;
    setIsSendingMessage(true);

    // 送信は待たずに実行（失敗してもフォームは開く）
    apiRequest("POST", "/api/line/send-message", {
      userId: userProfile.userId,
      type: "card",
      formUrl: generatedUrl,          // ★カードの「フォームを開く」に使う
      title: "Googleフォーム回答通知",        // 任意（altTextにも反映）
    }).catch((e) => {
      console.warn("send-message failed (ignored):", e);
    });

    // すぐフォームへ遷移（既存ロジックのまま）
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      window.location.href = generatedUrl;
    } else {
      window.open(generatedUrl, "_blank");
    }


    // フォームを開く
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      window.location.href = generatedUrl;
    } else {
      window.open(generatedUrl, "_blank");
    }
    console.log('url::', generatedUrl, 'entryID::', detectedEntries, 'uid::', userProfile.userId)
    setIsSendingMessage(false);
  };

  const handleRetry = () => {
    setError(null);
    if (!isLoggedIn) handleLineLogin();
  };

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
            <div className="flex items-center space-x-3">
              <h1 className="text-lg font-semibold text-gray-900">Googleフォーム-LINE連携システム</h1>
            </div>
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
                <img
                  src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300"
                  alt="スマートフォンでLINEアプリを使用している様子"
                  className="w-32 h-24 object-cover rounded-lg mx-auto mb-4"
                />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">LINEでログイン</h2>
                <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                  LINEアカウントでログインして、<br />
                  ユーザーIDを安全に取得します
                </p>
                <Button
                  onClick={handleLineLogin}
                  disabled={loginMutation.isPending}
                  className="w-full bg-line-green hover:bg-line-brand text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 min-h-[48px]"
                  data-testid="button-line-login"
                >
                  {loginMutation.isPending ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>認証中...</span>
                    </div>
                  ) : (
                    <span>LINEでログイン</span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 自動モード：ログイン済み → フォームアクセス */}
        {isLoggedIn && userProfile && formUrl && isAutoMode && (
          isGeneratingUrl ? (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="text-center">
                  <h3 className="text-base font-semibold">
                    <div className="flex items-center justify-center space-x-2 text-blue-600">
                      <div className="animate-spin h-4 w-4 border-2 border-blue-800 border-t-transparent rounded-full"></div>
                      <span>URLを生成中...</span>
                    </div>
                  </h3>
                </div>
              </CardContent>
            </Card>
          ) : (
            <button
              onClick={sendLineMessageAndOpenForm}
              disabled={isSendingMessage || !generatedUrl}
              className="w-full p-0 h-auto"
              // style={{ backgroundColor: "#1e9df1" }}
              data-testid="button-access-form"
            >
              {/* <Card className="w-full border-0" style={{ backgroundColor: "#1e9df1" }}>
                <CardContent className="pt-6"> */}
              <div className="text-center text-blue">
                {/* {isSendingMessage ? (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>メッセージ送信中...</span>
                      </div>
                    ) : ( */}
                <p className="text-sm text-blue-800 mt-6">自動でフォームにアクセスしない時はここをクリック</p>
                {/*  )} */}
              </div>
              {/* </CardContent>
              </Card> */}
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
                        {isDetecting ? (
                          <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
                            <span>連携リンク生成中...</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <span>✨</span>
                            <span>連携リンクを生成</span>
                          </div>
                        )}
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
                            {isDetecting ? (
                              <div className="flex justify-center">
                                <div className="animate-spin rounded-full h-5 w-5 border-b border-primary"></div>
                              </div>
                            ) : detectedEntries ? (
                              `${window.location.origin}/?form=${encodeURIComponent(formUrl)}&redirect=true`
                            ) : (
                              <div className="flex justify-center">・・・</div>
                            )}
                          </code>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          const shareUrl = `${window.location.origin}/api/link-preview?` + new URLSearchParams({
                            form: formUrl,                      // 実際の GoogleフォームURL
                            desc: formDescription, // 好きな説明文（任意）
                            // title: formTitle,                // 強制上書きしたいときだけ
                            // image: 'https://.../og.png',     // 共有プレビュー画像を変えたいときだけ
                          }).toString();
                          navigator.clipboard.writeText(shareUrl);
                          console.log(shareUrl)
                          showToast('共有リンクをコピーしました', 'success');

                          // const userLink = `${window.location.origin}/?form=${encodeURIComponent(formUrl)}&redirect=true`;
                          // navigator.clipboard.writeText(userLink);
                          // showToast("リンクをコピーしました", "success");
                        }}
                        variant={detectedEntries ? "default" : "outline"}
                        size="sm"
                        className="w-full text-green-700 border-green-300 hover:bg-green-100 mt-2"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        リンクをコピー
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-amber-50 rounded-lg mb-4">
                      <h5 className="text-xs font-semibold text-amber-800 mb-1">Googleフォーム側の重要な設定</h5>
                      <p className="text-xs text-amber-700 mb-2">
                        ⚠️LINEと連携するため、
                        <strong style={{ color: "red" }}>必ず次の設定をしてください</strong>
                      </p>
                      <div className="bg-white rounded border p-2 mb-2">
                        <p className="text-xs text-gray-600">
                          📝 <strong>設定手順：</strong><br />
                          1. 質問１のタイトル: 「LINE User ID」<br />
                          2. 質問１の回答形式: 記述式（短文）<br />
                          3. 質問１の必須: ON<br />
                          （メールアドレスの設定はあってもなくてもok）
                        </p>
                      </div>
                      <p className="text-xs text-amber-700 mb-2">
                        UID欄が空白になる問題を防ぐため、<br />
                        <strong>以下の設定を推奨します</strong>
                      </p>
                      <div className="bg-white rounded border p-2 mb-2">
                        <p className="text-xs text-gray-600">
                          📝 <strong>設定手順：</strong><br />
                          1. Googleフォーム編集画面 → 「設定」タブ<br />
                          2. 「回答」 → 「回答を1回に制限する」をオン<br />
                          3. これで「別の回答を送信」が無効化されます
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

      {/* Footer */}
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
      {/* Toast Notification */}
      <ToastNotification
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
}