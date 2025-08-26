import { useState, useEffect } from "react";
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

  // Initialize LIFF on component mount
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

            // Save user to backend
            await saveUserToBackend(profile);
          }
        }
      } catch (error) {
        console.error('LIFF initialization failed:', error);
        setError('LIFF初期化に失敗しました。ページをリロードしてください。');
      }
    };

    initLiff();
  }, []);

  // Generate URL when user is logged in and has form URL
  useEffect(() => {
    if (userProfile && formUrl && isAutoMode) {
      setIsGeneratingUrl(true);
      generatePrefillUrl(formUrl, userProfile.userId)
        .then(url => {
          setGeneratedUrl(url);
          setIsGeneratingUrl(false);
        })
        .catch(error => {
          console.error('URL generation failed:', error);
          setIsGeneratingUrl(false);
        });
    } else {
      setGeneratedUrl(null);
      setIsGeneratingUrl(false);
    }
  }, [
    userProfile,
    // formUrl,
    isAutoMode,
    lastDetectionResult,
    detectedEntries
  ]);

  // URLパラメータからフォーム情報を読み取り
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const formParam = urlParams.get('form');

    if (formParam) {
      try {
        const decodedFormUrl = decodeURIComponent(formParam);
        setFormUrl(decodedFormUrl);
        setIsAutoMode(true);
        console.log('Auto mode activated with form:', decodedFormUrl);
      } catch (error) {
        console.error('Failed to parse URL parameters:', error);
      }
    }
  }, []);

  const saveUserToBackend = async (profile: LiffProfile) => {
    try {
      await apiRequest('POST', '/api/line-users', {
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
      });
    } catch (error) {
      console.error('Failed to save user to backend:', error);
    }
  };

  // LINE login mutation
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
      // showToast('ログインしました', 'success');
    },
    onError: (error: Error) => {
      console.error('Login failed:', error);
      setError('ログインに失敗しました。もう一度お試しください。');
    },
  });

  const handleLineLogin = () => {
    if (loginMutation.isPending) return;
    setError(null);
    loginMutation.mutate();
  };

  // Auto-detect entry IDs from Google Forms URL
  const handleDetectEntries = async () => {
    if (!formUrl.trim()) {
      showToast('フォームURLを先に入力してください', 'error');
      return;
    }

    console.log('🔍 STARTING DETECTION');
    console.log('📝 Input form URL from state:', formUrl);
    console.log('📝 URL length:', formUrl.length);
    console.log('📝 URL contains d/e/:', formUrl.includes('/d/e/'));

    setIsDetecting(true);
    setDetectedEntries(null);
    setLastDetectionResult(null);
    try {
      const result = await GoogleFormsManager.detectEntryIds(formUrl);
      console.log('🔍 Detection result:', result);
      if (result.success) {
        console.log('✅ Setting detected entries:', {
          userId: result.userId,
          message: result.message
        });
        const detectionResult = {
          userId: result.userId!,
          message: result.message,
          formUrl: formUrl
        };
        setDetectedEntries({
          userId: result.userId,
          message: result.message
        });
        // Save the detection result for immediate use
        setLastDetectionResult(detectionResult);
        console.log('💾 Saved detection result:', detectionResult);
      } else {
        console.log('❌ Detection failed:', result.error);
        showToast(`検出に失敗しました: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Entry detection failed:', error);
      showToast('検出中にエラーが発生しました', 'error');
    } finally {
      setIsDetecting(false);
    }
  };

  const generatePrefillUrl = async (originalUrl: string, userId: string): Promise<string> => {
    try {
      // Google Formsのプリフィル用URLを生成
      let url = originalUrl;
      // Remove existing query parameters to ensure clean prefill
      const baseUrl = url.split('?')[0];
      // Use detected entry ID or fallback to default
      // Priority: Use the most recently detected entry ID for this specific form URL
      // let userIdEntry =  'entry.1795297917'; // Default fallback (most common)
      let userIdEntry = detectedEntries?.userId; // Default fallback (most common)
      // Check if we have a recent detection result for this form URL
      if (lastDetectionResult && lastDetectionResult.formUrl === originalUrl) {
        userIdEntry = lastDetectionResult.userId;
        console.log('🚀 Using fresh detection result:', lastDetectionResult, detectedEntries?.userId);
      } else if (detectedEntries?.userId) {
        userIdEntry = detectedEntries.userId;
        console.log('📋 Using stored state result:', detectedEntries);
      } else {
        console.log('⚠️ No detection result available, attempting automatic detection...');
        try {
          const detectionResult = await GoogleFormsManager.detectEntryIds(originalUrl);
          if (detectionResult.success && detectionResult.userId) {
            userIdEntry = detectionResult.userId;
            console.log('🎯 Auto-detection successful:', detectionResult.userId);
            // Save the result for future use
            setLastDetectionResult({
              userId: detectionResult.userId,
              message: detectionResult.message,
              formUrl: originalUrl
            });
            setDetectedEntries({
              userId: detectionResult.userId,
              message: detectionResult.message
            });
          } else {
            console.log('❌ Auto-detection failed, using fallback');
          }
        } catch (error) {
          console.log('❌ Auto-detection error, using fallback:', error);
        }
      }
      console.log('🎯 Generating URL with entry ID:', {
        userIdEntry,
        detectedEntries,
        lastDetectionResult,
        hasDetectedEntries: !!detectedEntries,
        originalUrl,
        isMatchingUrl: lastDetectionResult?.formUrl === originalUrl
      });
      // Google Forms prefill format: baseUrl + ?usp=pp_url + &entry.ID=value
      const prefillUrl = `${baseUrl}?usp=pp_url&${userIdEntry}=${encodeURIComponent(userId)}`;
      // Add message entry if available (for future additional message features)
      if (detectedEntries?.message) {
        const finalUrl = `${prefillUrl}&${detectedEntries.message}=`;
        console.log('Generated prefill URL with detected entries:', finalUrl, {
          detectedEntries,
          userIdEntry,
          baseUrl,
          originalUrl
        });
        return finalUrl;
      }
      console.log('Generated prefill URL with detected entries:', prefillUrl, {
        detectedEntries,
        userIdEntry,
        baseUrl,
        originalUrl
      });
      return prefillUrl;
    } catch (error) {
      console.error('Failed to generate prefill URL:', error);
      return originalUrl;
    }
  };

  const handleRetry = () => {
    setError(null);
    if (!isLoggedIn) {
      handleLineLogin();
    }
  };

  // Function to send LINE message when accessing form
  const sendLineMessageAndOpenForm = async () => {
    if (!userProfile || !generatedUrl) return;

    setIsSendingMessage(true);

    try {
      console.log('📨 Sending LINE message to user:', userProfile.userId);

      // Send message via API
      const response = await apiRequest('POST', '/api/line/send-message', {
        userId: userProfile.userId,
        message: 'テスト'
      });

      console.log('✅ Message sent successfully:', response);

      // スマホ対応: window.openの代わりにlocation.hrefを使用
      if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        // スマホの場合は現在のタブでフォームを開く
        window.location.href = generatedUrl;
      } else {
        // PCの場合は新しいタブで開く
        window.open(generatedUrl, '_blank');
      }

      // アラート削除 - 成功メッセージは表示しない

    } catch (error) {
      console.error('❌ Failed to send LINE message:', error);
      showToast('メッセージ送信に失敗しました', 'error');
    } finally {
      setIsSendingMessage(false);
    }
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
        {/* Welcome Card - shown when not authenticated and in auto mode */}
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
                    <div className="flex items-center justify-center space-x-2">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.2 0-.395-.078-.534-.22a.631.631 0 01-.028-.028l-2.51-2.681v2.262c0 .345-.282.63-.631.63-.345 0-.627-.285-.627-.63V8.108c0-.27.173-.51.43-.595.06-.02.124-.029.188-.029.2 0 .395.078.534.22a.631.631 0 01.028.028l2.51 2.681V8.108c0-.345.282-.63.631-.63.345 0 .627.285.627.63v4.771z" />
                        <path d="M9.5 8.738c0-.345-.282-.63-.631-.63-.345 0-.627.285-.627.63v4.771c0 .345.282.63.627.63.349 0 .631-.285.631-.63V8.738z" />
                        <path d="M6.419 13.509c0 .345-.282.63-.631.63-.345 0-.627-.285-.627-.63V8.108c0-.345.282-.63.627-.63h1.888c.832 0 1.509.677 1.509 1.509v.63c0 .832-.677 1.508-1.509 1.508H6.419v2.384zm.631-3.645h1.257c.173 0 .315-.141.315-.315v-.63c0-.174-.142-.315-.315-.315H7.05v1.26z" />
                      </svg>
                      <span>LINEでログイン</span>
                    </div>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Simple Form Access Link - shown after authentication in auto mode only */}
        {isLoggedIn && userProfile && formUrl && isAutoMode && (
          isGeneratingUrl ? (
            <Card className="mb-6" >
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
            <Button
              onClick={sendLineMessageAndOpenForm}
              disabled={isSendingMessage || !generatedUrl}
              className="w-full p-0 h-auto"
              style={{ backgroundColor: "#1e9df1" }}
              data-testid="button-access-form"
            >
              <Card className="mb-6 w-full border-0" style={{ backgroundColor: "#1e9df1" }}>
                <CardContent className="pt-6">
                  <div className="text-center text-white">
                    {isSendingMessage ? (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>メッセージ送信中...</span>
                      </div>
                    ) : (
                      <h3 className="text-lg font-semibold">
                        フォームにアクセス
                      </h3>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Button>
          )
        )}

        {/* Logged in but no form URL - show simple message */}
        {/* {isLoggedIn && userProfile && !formUrl && !isAdmin && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">ログイン完了</h3>
                <p className="text-gray-600 text-sm">
                  フォームURLがパラメータに含まれていません。<br />
                  正しいリンクからアクセスしてください。
                </p>
              </div>
            </CardContent>
          </Card>
        )} */}

        {/* Error State - shown when login fails */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-red-800 mb-2">エラーが発生しました</h3>
                <p className="text-red-600 text-sm mb-6 leading-relaxed">{error}</p>
                <Button
                  onClick={handleRetry}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  もう一度試す
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Simple Admin Mode - Only when not auto mode */}
        {!isAutoMode && (
          <>
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">管理者モード</h3>
                  {/* <p className="text-gray-600 text-sm">GoogleフォームとLINEの連携リンクを生成</p> */}
                </div>
                {isAdmin ? (
                  <div className="space-y-4">
                    <div>
                      {/* <label className="block text-sm font-medium text-gray-700 mb-2">
            Googleフォーム URL
          </label> */}
                      <div className="relative">
                        <Input
                          type="url"
                          value={formUrl}

                          onChange={(e) => {
                            setFormUrl(e.target.value);
                            // Reset detected entries when URL changes
                            if (detectedEntries) setDetectedEntries(null);
                            if (lastDetectionResult) setLastDetectionResult(null);
                          }}
                          placeholder="GoogleフォームのURLを入力"
                          className="pr-5 text-gray-600 text-sm" />
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
                      {/* {detectedEntries && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h5 className="text-xs font-semibold text-blue-800 mb-2">✅ 検出されたEntry ID</h5>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-blue-700">UID用:</span>
                  <code className="bg-white px-1 rounded text-blue-900">{detectedEntries.userId || 'なし'}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">メッセージ用:</span>
                  <code className="bg-white px-1 rounded text-blue-900">{detectedEntries.message || 'なし'}</code>
                </div>
              </div>
              <p className="text-xs text-blue-600 mt-2">
                🎯 このフォームでUID自動入力が設定されました
              </p>
            </div>
          )} */}
                    </div>

                    <div className="space-y-3">
                      <div className="p-4 bg-green-50 rounded-lg border">
                        {detectedEntries &&
                          <h4 className="text-sm font-semibold text-green-800 mb-2">連携リンクを再生しました。以下のリンクを</h4>}
                        <h4 className="text-sm font-semibold text-green-800 mb-2">GoogleフォームURLとしてご利用ください。</h4>
                        <p className="text-xs text-green-700 mb-3">
                          フォームのデータが公式LINEで利用可能になります
                        </p>
                        <div className="bg-white rounded border p-3 mb-3">
                          <code className="text-xs font-mono text-gray-800 break-all">
                            {isDetecting ? <div className="flex justify-center">
                              <div className="animate-spin rounded-full h-5 w-5 border-b border-primary"></div>
                            </div> :
                              detectedEntries ? `${window.location.origin}/?form=${encodeURIComponent(formUrl)}&redirect=true` : <div className="flex justify-center"> ・・・</div>}
                          </code>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          const userLink = `${window.location.origin}/?form=${encodeURIComponent(formUrl)}&redirect=true`;
                          navigator.clipboard.writeText(userLink);
                          showToast('リンクをコピーしました', 'success');
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
                  <><div className="p-3 bg-amber-50 rounded-lg mb-4">
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
                      onClick={() => {
                        setIsAdmin(true);
                      }}
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
              <button
                onClick={() => {
                  setIsAdmin(false)
                }}
                className="px-2"
              >
                {isAdmin ? <div className="rounded-full h-3 w-3 bg-primary"></div> : <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white"></div>}
              </button>
              <button
                onClick={() => {
                  setIsAdmin(true)
                }}
                className="px-2"
              >
                {!isAdmin ? <div className="rounded-full h-3 w-3 bg-primary"></div> : <div className="rounded-full h-3 w-3 border border-1 border-primary bg-white"></div>}
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
            <a href="https://github.com/asagaorino0/LINE_login.git" className="hover:text-line-green transition-colors" target="_blank" rel="noopener noreferrer">
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