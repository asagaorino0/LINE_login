import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { RefreshCw, Github, Shield, HelpCircle } from "lucide-react";
import { liffManager, type LiffProfile } from "../lib/liff";
import { apiRequest } from "../lib/queryClient";
import { ToastNotification, useToastNotification } from "../components/ui/toast-notification";

export default function Home() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<LiffProfile | null>(null);
  const [formUrl, setFormUrl] = useState("");
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      showToast('ログインしました', 'success');
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

  const generatePrefillUrl = (originalUrl: string, userId: string): string => {
    try {
      // Google FormsのURLにプリフィルパラメータを追加
      let url = originalUrl;

      // URLに?が含まれているかチェック
      const separator = url.includes('?') ? '&' : '?';

      // entry.1587760013 (ユーザーID用)にUIDを事前設定
      url += `${separator}entry.1587760013=${encodeURIComponent(userId)}`;

      console.log('Generated prefill URL:', url);
      return url;
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
              <div className="w-8 h-8 bg-line-green rounded-lg flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.2 0-.395-.078-.534-.22a.631.631 0 01-.028-.028l-2.51-2.681v2.262c0 .345-.282.63-.631.63-.345 0-.627-.285-.627-.63V8.108c0-.27.173-.51.43-.595.06-.02.124-.029.188-.029.2 0 .395.078.534.22a.631.631 0 01.028.028l2.51 2.681V8.108c0-.345.282-.63.631-.63.345 0 .627.285.627.63v4.771z" />
                  <path d="M9.5 8.738c0-.345-.282-.63-.631-.63-.345 0-.627.285-.627.63v4.771c0 .345.282.63.627.63.349 0 .631-.285.631-.63V8.738z" />
                  <path d="M6.419 13.509c0 .345-.282.63-.631.63-.345 0-.627-.285-.627-.63V8.108c0-.345.282-.63.627-.63h1.888c.832 0 1.509.677 1.509 1.509v.63c0 .832-.677 1.508-1.509 1.508H6.419v2.384zm.631-3.645h1.257c.173 0 .315-.141.315-.315v-.63c0-.174-.142-.315-.315-.315H7.05v1.26z" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-gray-900">UID取得システム</h1>
            </div>
            <div className="text-sm text-gray-500">v1.0</div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {/* Welcome Card - shown when not authenticated */}
        {!isLoggedIn && (
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

        {/* Simple Form Access Link - shown after authentication */}
        {isLoggedIn && userProfile && formUrl && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-4">
                  <a
                    href={generatePrefillUrl(formUrl, userProfile.userId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    フォームにアクセス
                  </a>
                </h3>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logged in but no form URL - show simple message */}
        {isLoggedIn && userProfile && !formUrl && (
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
        )}

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