import { useState, useEffect } from 'react';
import { useAuth, signOut } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { LogOut, Settings, Key, Save, ArrowLeft } from 'lucide-react';

export default function LineSettings() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [lineSettings, setLineSettings] = useState({
    channelAccessToken: '',
    channelSecret: '',
    liffId: ''
  });
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // 認証チェック
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/sign-in';
    }
  }, [isLoading, isAuthenticated]);

  // ホームに戻る
  const handleBackHome = () => {
    window.location.href = '/';
  };

  // ログアウト処理
  const handleSignOut = () => {
    signOut();
    window.location.href = '/';
  };

  // LINE設定保存
  const handleSaveLineSettings = () => {
    if (!lineSettings.channelAccessToken || !lineSettings.channelSecret) {
      alert('チャンネルアクセストークンとチャンネルシークレットを入力してください');
      return;
    }
    
    // デモ用の設定保存
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg font-medium text-gray-600">読み込み中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // リダイレクト処理中
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm" onClick={handleBackHome}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                戻る
              </Button>
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                LINE設定管理
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {user?.name || user?.email?.split('@')[0]}さん
              </span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                ログアウト
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* ページタイトル */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            LINE API設定
          </h2>
          <p className="text-gray-600">
            LINE公式アカウントのAPI設定を管理します。設定後、Google Forms連携が利用可能になります。
          </p>
        </div>

        {/* LINE設定カード */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Key className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">API認証情報</h3>
                <p className="text-sm text-gray-600">LINE Developers Consoleから取得した情報を入力してください</p>
              </div>
            </div>

            {showSuccessMessage && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                ✓ LINE API設定が正常に保存されました！
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="channelAccessToken" className="text-sm font-medium text-gray-700">
                  チャンネルアクセストークン *
                </label>
                <Input
                  id="channelAccessToken"
                  type="password"
                  placeholder="チャンネルアクセストークンを入力"
                  value={lineSettings.channelAccessToken}
                  onChange={(e) => setLineSettings({...lineSettings, channelAccessToken: e.target.value})}
                />
                <p className="text-xs text-gray-500">
                  LINE Developers Console → チャンネル設定 → Messaging API設定から取得
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">
                  チャンネルシークレット *
                </label>
                <Input
                  id="channelSecret"
                  type="password"
                  placeholder="チャンネルシークレットを入力"
                  value={lineSettings.channelSecret}
                  onChange={(e) => setLineSettings({...lineSettings, channelSecret: e.target.value})}
                />
                <p className="text-xs text-gray-500">
                  LINE Developers Console → チャンネル設定 → Basic settingsから取得
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="liffId" className="text-sm font-medium text-gray-700">
                  LIFF ID
                </label>
                <Input
                  id="liffId"
                  placeholder="LIFF IDを入力（例: 1234567890-abcdefgh）"
                  value={lineSettings.liffId}
                  onChange={(e) => setLineSettings({...lineSettings, liffId: e.target.value})}
                />
                <p className="text-xs text-gray-500">
                  LINE Developers Console → LIFF → アプリ設定から取得（オプション）
                </p>
              </div>

              <Button 
                onClick={handleSaveLineSettings}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Save className="mr-2 h-4 w-4" />
                設定を保存
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 設定ガイド */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">設定手順</h3>
            <div className="space-y-4">
              <div className="flex space-x-4">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                  1
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">LINE Developersでチャンネル作成</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    LINE Developers ConsoleでMessaging APIチャンネルを作成
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-4">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                  2
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">API設定の取得</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    チャンネルアクセストークンとチャンネルシークレットを上記フォームに入力
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-4">
                <div className="w-6 h-6 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                  3
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Google Forms連携テスト</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    設定完了後、実際のGoogleフォームでUID取得をテスト
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}