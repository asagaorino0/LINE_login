// app/line-settings/client.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { liffManager } from "@/lib/liff";
import { apiRequest } from "../lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Key, Save, Settings, LogOut, ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function LineSettingsClient() {
  const router = useRouter();
  const { user } = useAuth();
  const [lineSettings, setLineSettings] = useState({ channelAccessToken: "", channelSecret: "", liffId: "" });
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const didRunRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [fingerprints, setFingerprints] = useState<{ liffId?: string; channelSecret?: string; channelAccessToken?: string } | null>(null);
  const shopId = ""; // 必要ならプロフィール等から取得して埋めてください（未設定なら default で保存）
  const [lineUserId, setLineUserId] = useState<string>("");

  useEffect(() => {
    // 既存状態の読み込み（指紋と最終更新のみ）
    (async () => {
      try {
        const r = await fetch(`/api/line-secrets?shopId=${encodeURIComponent(shopId || "default")}`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.exists) setFingerprints(j.fingerprints ?? null);
        }
      } catch { }
    })();
  }, []);

  // LIFF ログイン済みなら管理者を upsert（失敗は握りつぶす）
  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    (async () => {
      const ok = await liffManager.init();
      if (!ok || !liffManager.isLoggedIn()) return;
      const p = await liffManager.getProfile();
      if (p) {
        setLineUserId(p.userId); // ★保存に使う
        await apiRequest("POST", "/api/line-admin", {
          lineUserId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl ?? null,
        }).catch(() => { });
      }
    })().catch(() => { });
  }, []);

  const handleBackHome = () => router.push("/");
  const handleSignOut = async () => {
    await fetch("/api/admin-logout", { method: "POST" }).catch(() => { });
    router.replace("/");
  };
  const handleSaveLineSettings = async () => {
    if (!lineUserId) {
      alert("LINE にログインしてください（lineUserId が取得できません）");
      return;
    }
    if (!lineSettings.channelAccessToken || !lineSettings.channelSecret) {
      alert("チャンネルアクセストークンとチャンネルシークレットを入力してください");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/line-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId, ...lineSettings }), // ★id=lineUserIdで保存
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "save failed");
      // 成功処理（既存のまま）
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
      setLineSettings({ channelAccessToken: "", channelSecret: "", liffId: "" });
    } catch (e: any) {
      alert(`保存失敗: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

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
              <h1 className="text-xl font-semibold text-gray-900">LINE設定管理</h1>
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

      {/* メイン */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* タイトル */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">LINE API設定</h2>
          <p className="text-gray-600">
            LINE公式アカウントのAPI設定を管理します。設定後、Google Forms連携が利用可能になります。
          </p>
        </div>

        {/* 設定カード */}
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

            {fingerprints && (
              <div className="mb-4 text-xs text-gray-600">
                <div>保存済みフィンガープリント（照合用・平文は表示しません）</div>
                <ul className="list-disc ml-5">
                  {fingerprints.liffId && <li>LIFF ID: {fingerprints.liffId}</li>}
                  {fingerprints.channelSecret && <li>Channel Secret: {fingerprints.channelSecret}</li>}
                  {fingerprints.channelAccessToken && <li>Access Token: {fingerprints.channelAccessToken}</li>}
                </ul>
              </div>
            )}
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="channelAccessToken" className="text-sm font-medium text-gray-700">チャンネルアクセストークン *</label>
                <Input
                  id="channelAccessToken"
                  type="password"
                  placeholder="チャンネルアクセストークンを入力"
                  value={lineSettings.channelAccessToken}
                  onChange={(e) => setLineSettings({ ...lineSettings, channelAccessToken: e.target.value })}
                />
                <p className="text-xs text-gray-500">LINE Developers Console → チャンネル設定 → Messaging API設定から取得</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">チャンネルシークレット *</label>
                <Input
                  id="channelSecret"
                  type="password"
                  placeholder="チャンネルシークレットを入力"
                  value={lineSettings.channelSecret}
                  onChange={(e) => setLineSettings({ ...lineSettings, channelSecret: e.target.value })}
                />
                <p className="text-xs text-gray-500">LINE Developers Console → チャンネル設定 → Basic settingsから取得</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="liffId" className="text-sm font-medium text-gray-700">LIFF ID</label>
                <Input
                  id="liffId"
                  placeholder="LIFF IDを入力（例: 1234567890-abcdefgh）"
                  value={lineSettings.liffId}
                  onChange={(e) => setLineSettings({ ...lineSettings, liffId: e.target.value })}
                />
                <p className="text-xs text-gray-500">LINE Developers Console → LIFF → アプリ設定から取得（オプション）</p>
              </div>

              <Button onClick={handleSaveLineSettings} disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
                <Save className="mr-2 h-4 w-4" />
                {loading ? "保存中…" : "設定を保存"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 設定ガイド */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">設定手順</h3>
            {/* ...（省略：元と同じ）... */}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
