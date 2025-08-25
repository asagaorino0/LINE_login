import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { Copy, ExternalLink, Github, Shield, HelpCircle, RefreshCw } from "lucide-react";
import { liffManager, type LiffProfile } from "../lib/liff";
import { GoogleFormsManager } from "../lib/googleForms";
import { apiRequest } from "../lib/queryClient";
import { ToastNotification, useToastNotification } from "../components/ui/toast-notification";
import { cn } from "../lib/utils";

export default function Home() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<LiffProfile | null>(null);
  const [formUrl, setFormUrl] = useState("https://forms.gle/example123");
  const [additionalMessage, setAdditionalMessage] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submissionTime, setSubmissionTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { toast, showToast, hideToast } = useToastNotification();
  const queryClient = useQueryClient();

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

  // Form submission mutation
  const submitFormMutation = useMutation({
    mutationFn: async () => {
      if (!userProfile) throw new Error('User not logged in');
      
      // Validate form URL
      if (!GoogleFormsManager.validateFormUrl(formUrl)) {
        throw new Error('無効なGoogleフォームURLです');
      }

      // Submit to Google Forms
      const result = await GoogleFormsManager.submitToForm({
        userId: userProfile.userId,
        additionalMessage: additionalMessage || undefined,
        formUrl: formUrl,
      });

      // Save submission to backend
      await apiRequest('POST', '/api/form-submissions', {
        lineUserId: userProfile.userId,
        formUrl: formUrl,
        additionalMessage: additionalMessage || undefined,
      });

      return result;
    },
    onSuccess: (result) => {
      setHasSubmitted(true);
      setSubmissionTime(result.timestamp);
      setError(null);
      showToast('送信が完了しました', 'success');
      
      // Invalidate form submissions query
      if (userProfile) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/form-submissions', userProfile.userId] 
        });
      }
    },
    onError: (error: Error) => {
      console.error('Form submission failed:', error);
      setError(error.message);
    },
  });

  const handleLineLogin = () => {
    if (loginMutation.isPending) return;
    setError(null);
    loginMutation.mutate();
  };

  const handleCopyUserId = async () => {
    if (!userProfile) return;
    
    try {
      await navigator.clipboard.writeText(userProfile.userId);
      showToast('ユーザーIDをコピーしました', 'success');
    } catch (error) {
      showToast('コピーに失敗しました', 'error');
    }
  };

  const handleSubmitForm = () => {
    if (!userProfile || submitFormMutation.isPending) return;
    
    if (!formUrl.trim()) {
      showToast('フォームURLを入力してください', 'error');
      return;
    }
    
    setError(null);
    submitFormMutation.mutate();
  };

  const handleReset = () => {
    setIsLoggedIn(false);
    setUserProfile(null);
    setHasSubmitted(false);
    setSubmissionTime(null);
    setError(null);
    setFormUrl("https://forms.gle/example123");
    setAdditionalMessage("");
    liffManager.logout();
  };

  const handleRetry = () => {
    setError(null);
    if (!isLoggedIn) {
      handleLineLogin();
    } else {
      handleSubmitForm();
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
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.2 0-.395-.078-.534-.220a.631.631 0 01-.028-.028l-2.51-2.681v2.262c0 .345-.282.63-.631.63-.345 0-.627-.285-.627-.63V8.108c0-.27.173-.51.43-.595.06-.02.124-.029.188-.029.2 0 .395.078.534.22a.631.631 0 01.028.028l2.51 2.681V8.108c0-.345.282-.63.631-.63.345 0 .627.285.627.63v4.771z"/>
                  <path d="M9.5 8.738c0-.345-.282-.63-.631-.63-.345 0-.627.285-.627.63v4.771c0 .345.282.63.627.63.349 0 .631-.285.631-.63V8.738z"/>
                  <path d="M6.419 13.509c0 .345-.282.63-.631.63-.345 0-.627-.285-.627-.63V8.108c0-.345.282-.63.627-.63h1.888c.832 0 1.509.677 1.509 1.509v.63c0 .832-.677 1.508-1.509 1.508H6.419v2.384zm.631-3.645h1.257c.173 0 .315-.141.315-.315v-.63c0-.174-.142-.315-.315-.315H7.05v1.26z"/>
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
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.2 0-.395-.078-.534-.22a.631.631 0 01-.028-.028l-2.51-2.681v2.262c0 .345-.282.63-.631.63-.345 0-.627-.285-.627-.63V8.108c0-.27.173-.51.43-.595.06-.02.124-.029.188-.029.2 0 .395.078.534.22a.631.631 0 01.028.028l2.51 2.681V8.108c0-.345.282-.63.631-.63.345 0 .627.285.627.63v4.771z"/>
                        <path d="M9.5 8.738c0-.345-.282-.63-.631-.63-.345 0-.627.285-.627.63v4.771c0 .345.282.63.627.63.349 0 .631-.285.631-.63V8.738z"/>
                        <path d="M6.419 13.509c0 .345-.282.63-.631.63-.345 0-.627-.285-.627-.63V8.108c0-.345.282-.63.627-.63h1.888c.832 0 1.509.677 1.509 1.509v.63c0 .832-.677 1.508-1.509 1.508H6.419v2.384zm.631-3.645h1.257c.173 0 .315-.141.315-.315v-.63c0-.174-.142-.315-.315-.315H7.05v1.26z"/>
                      </svg>
                      <span>LINEでログイン</span>
                    </div>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* User Info Card - shown after authentication */}
        {isLoggedIn && userProfile && !hasSubmitted && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                  {userProfile.pictureUrl ? (
                    <img 
                      src={userProfile.pictureUrl} 
                      alt={userProfile.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900" data-testid="text-display-name">
                    {userProfile.displayName}
                  </h3>
                  <p className="text-sm text-gray-500">LINEユーザー</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">ユーザーID</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyUserId}
                    className="text-xs text-line-green hover:text-line-brand font-medium h-auto p-1"
                    data-testid="button-copy-uid"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    コピー
                  </Button>
                </div>
                <div className="bg-white rounded border p-3">
                  <code className="text-sm font-mono text-gray-800 break-all" data-testid="text-user-id">
                    {userProfile.userId}
                  </code>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 text-success-green bg-green-50 rounded-lg p-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                </svg>
                <span className="text-sm font-medium">ログイン成功</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Google Form Card */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-google-blue rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Googleフォーム送信</h3>
            </div>
            
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              取得したユーザーIDを指定のGoogleフォームに送信します
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  送信先フォームURL
                </label>
                <div className="relative">
                  <Input
                    type="url"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://forms.gle/..."
                    className="pr-8"
                    data-testid="input-form-url"
                  />
                  <ExternalLink className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  追加メッセージ（オプション）
                </label>
                <Textarea
                  value={additionalMessage}
                  onChange={(e) => setAdditionalMessage(e.target.value)}
                  rows={3}
                  placeholder="フォームと一緒に送信する追加情報があれば入力してください"
                  className="resize-none"
                  data-testid="textarea-additional-message"
                />
              </div>
            </div>
            
            <Button
              onClick={handleSubmitForm}
              disabled={!isLoggedIn || submitFormMutation.isPending || hasSubmitted}
              className={cn(
                "w-full font-medium py-3 px-6 rounded-lg mt-6 transition-all duration-200 min-h-[48px]",
                isLoggedIn && !hasSubmitted 
                  ? "bg-google-blue hover:bg-blue-600 text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              )}
              data-testid="button-submit-form"
            >
              {submitFormMutation.isPending ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>送信中...</span>
                </div>
              ) : hasSubmitted ? (
                "送信完了"
              ) : isLoggedIn ? (
                "Googleフォームに送信"
              ) : (
                "LINEログイン後に有効になります"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Success Card - shown after form submission */}
        {hasSubmitted && submissionTime && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-success-green rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">送信完了</h3>
                <p className="text-gray-600 text-sm mb-6">
                  ユーザーIDがGoogleフォームに正常に送信されました
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">送信日時:</span>
                    <span className="font-mono text-gray-800" data-testid="text-submission-time">
                      {submissionTime.toLocaleString('ja-JP')}
                    </span>
                  </div>
                </div>
                
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200"
                  data-testid="button-reset"
                >
                  新しいセッションを開始
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Card */}
        {error && (
          <Card className="mb-6 border-red-200">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-error-red rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-medium text-error-red mb-2">エラーが発生しました</h4>
                  <p className="text-sm text-gray-600 mb-4" data-testid="text-error-message">
                    {error}
                  </p>
                  <Button
                    onClick={handleRetry}
                    size="sm"
                    className="bg-error-red hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors duration-200"
                    data-testid="button-retry"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    再試行
                  </Button>
                </div>
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
