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
import { cn } from "@/lib/utils";
import '../Timeline.css'

export default function LineSettingsClient({ onClick, login }: { onClick: () => void, login: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [lineSettings, setLineSettings] = useState({ channelName: "", channelSecret: "", channelAccessToken: "", liffId: "" });
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const didRunRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [lineUserId, setLineUserId] = useState<string>("");
  const [value, setValue] = useState<string>("");

  // useEffect(() => {
  //   (async () => {
  //     try {
  //       const r = await fetch("/api/line-secrets", { cache: "no-store" });
  //       if (r.ok) {
  //         const j = await r.json();
  //         if (j?.exists) setFingerprints(j.fingerprints ?? null);
  //       }
  //     } catch { }
  //   })();
  // }, []);

  // ② LIFF ログイン済みなら /api/line-admin を呼んで admin/uid クッキーをサーバでセット
  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    (async () => {
      const ok = await liffManager.init();

      // LINE外環境では完全にスキップ・UIDクリア
      if (!liffManager.inClient()) {
        setLineUserId("");
        console.log("[LINE-SETTINGS] Not in LINE client, clearing UID");
        return;
      }

      if (!ok || !liffManager.isLoggedIn()) return;
      const p = await liffManager.getProfile();
      if (!p) return;

      setLineUserId(p.userId); // 表示用に残すだけ（保存には使わない）

      // ★ここ！ uid=LINEのuserId をクッキーにセット（サーバ側で）
      await fetch("/api/line-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId: p.userId }),
      }).catch(() => { });
    })().catch(() => { });
  }, []);

  // ③ 保存時は lineUserId を送らない（サーバが cookie の uid を id に使う）
  const handleSaveLineSettings = async () => {
    if (!lineSettings.channelAccessToken || !lineSettings.channelSecret) {
      alert("チャンネルアクセストークンとチャンネルシークレットを入力してください");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/line-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lineSettings }), // ← lineUserId は不要
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "save failed");
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
      setLineSettings({ channelName: "", channelSecret: "", channelAccessToken: "", liffId: "" });
    } catch (e: any) {
      alert(`保存失敗: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* メイン */}
      <main className="max-w-4xl mx-auto px-4 pb-4">
        {/* タイトル */}
        <div className="mb-4">
          {/* <h2 className="text-2xl font-bold text-gray-900 mb-2">LINE API設定</h2> */}
          <p className="text-gray-600">
            {/* LINE公式アカウントのAPI設定を管理します。 */}
            設定後、<strong>フォーム回答通知機能</strong>が利用可能になります。
          </p>
        </div>
        {/* タイムライン */}
        <div className="mt-3 text-center">
          <div
            // style={{ width: "210px" }}
            className="mt-2">
            {value === "" &&
              <ol className="timeline-003">
                <li>step1</li>
                <li>step2</li>
                <li>step3</li>
                <li>step4</li>
                <li>step5</li>
              </ol>}
            {value === "1" &&
              <ol className="timeline-003">
                <li className="current">step1</li>
                <li>step2</li>
                <li>step3</li>
                <li>step4</li>
                <li>step5</li>
              </ol>}
            {value === "2" &&
              <ol className="timeline-003">
                <li className="prev">step1</li>
                <li className="current">step2</li>
                <li>step3</li>
                <li>step4</li>
                <li>step5</li>
              </ol>}
            {value === "3" &&
              <ol className="timeline-003">
                <li className="prev">step1</li>
                <li className="prev">step2</li>
                <li className="current">step3</li>
                <li>step4</li>
                <li>step5</li>
              </ol>}
            {value === "4" &&
              <ol className="timeline-003">
                <li className="prev">step1</li>
                <li className="prev">step2</li>
                <li className="prev">step3</li>
                <li className="current">step4</li>
                <li>step5</li>
              </ol>}
            {value === "5" &&
              <ol className="timeline-003">
                <li className="prev">step1</li>
                <li className="prev">step2</li>
                <li className="prev">step3</li>
                <li className="prev">step4</li>
                <li className="current">step5</li>
              </ol>}
          </div>
        </div>

        {/* 設定カード */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Key className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">チャンネル基本設定</h3>
                <p className="text-sm text-gray-600">
                  <span className="M7eMe">
                    <a href="https://developers.line.biz/console/" target="blank" style={{ color: "blue" }}>
                      LINE Developers Console
                    </a>
                  </span>
                  から取得
                </p>
              </div>
            </div>

            {showSuccessMessage && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                ✓ LINE API設定が正常に保存されました！
              </div>
            )}
            {/* {fingerprints && (
              <div className="mb-4 text-xs text-gray-600">
                <div>保存済みフィンガープリント（照合用・平文は表示しません）</div>
                <ul className="list-disc ml-5">
                  {fingerprints.liffId && <li>LIFF ID: {fingerprints.liffId}</li>}
                  {fingerprints.channelSecret && <li>Channel Secret: {fingerprints.channelSecret}</li>}
                  {fingerprints.channelAccessToken && <li>Access Token: {fingerprints.channelAccessToken}</li>}
                </ul>
              </div>
            )} */}
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">チャネル名 *</label>
                <Input
                  id="channelSecret"
                  type="text"
                  placeholder="チャネル名を入力"
                  value={lineSettings.channelName}
                  onChange={(e) => { setLineSettings({ ...lineSettings, channelName: e.target.value }), setValue("1") }}
                />
                <p className="text-xs text-gray-500">LINE Developers Console →  <strong>チャンネル基本設定</strong> → <strong>基本情報</strong> 内</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">チャンネルシークレット *</label>
                <Input
                  id="channelSecret"
                  type="password"
                  placeholder="チャンネルシークレットを入力"
                  value={lineSettings.channelSecret}
                  onChange={(e) => { setLineSettings({ ...lineSettings, channelSecret: e.target.value }), setValue("2") }}
                />
                <p className="text-xs text-gray-500">LINE Developers Console →  <strong>チャンネル基本設定</strong> → <strong>基本情報</strong> 内</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="userId" className="text-sm font-medium text-gray-700">【確認】あなたのユーザーID</label>
                <div
                  className={cn(
                    "flex h-10 w-full items-center rounded-md bg-gray-300 px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                    "overflow-x-auto whitespace-nowrap scrollbar-hide"/////横方向にスクロール可能、テキストを折り返さず一行で、バー非表示
                  )}
                >
                  {liffManager.inClient() && liffManager.isLoggedIn() && lineUserId ? lineUserId : "（未ログイン）"}/   {lineUserId}
                </div>
                <p className="text-xs text-gray-500"><strong>上記は今ログインしているIDです。</strong></p>
                <p className="text-xs text-gray-500"><strong>チャンネル基本設定</strong> → <strong>基本情報</strong> 内の<strong>あなたのユーザーID</strong>と合致している必要があります。</p>
              </div>
              <div className="my-3 flex items-center space-x-2">
                <input
                  id="notify"
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => { setEnabled(e.target.checked), setValue("3") }}
                  className="h-4 w-4 text-green-600 border-gray-300 rounded"
                />
                <label htmlFor="notify" className="text-base text-gray-700">
                  ID 確認しました！合致してます。
                </label>
              </div>
              {enabled ?
                <>
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Key className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Messaging API設定</h3>
                      <p className="text-sm text-gray-600">
                        <span className="M7eMe">
                          <a href="https://developers.line.biz/console/" target="blank" style={{ color: "blue" }}>
                            LINE Developers Console
                          </a>
                        </span>
                        から取得
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="liffId" className="text-sm font-medium text-gray-700">ボットのベーシックID *</label>
                    <Input
                      id="liffId"
                      placeholder="例: @123abcde(９桁の英数字)"
                      value={lineSettings.liffId}
                      onChange={(e) => { setLineSettings({ ...lineSettings, liffId: e.target.value }), setValue("4") }}
                    />
                    <p className="text-xs text-gray-500">LINE Developers Console → <strong>Messaging API設定</strong> 内</p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="channelAccessToken" className="text-sm font-medium text-gray-700">チャンネルアクセストークン *</label>
                    <Input
                      id="channelAccessToken"
                      type="password"
                      placeholder="チャネルアクセストークン（長期）を入力"
                      value={lineSettings.channelAccessToken}
                      onChange={(e) => { setLineSettings({ ...lineSettings, channelAccessToken: e.target.value }), setValue("5") }}
                    />
                    <p className="text-xs text-gray-500">LINE Developers Console → <strong>Messaging API設定</strong> 内</p>
                  </div>
                  <Button onClick={handleSaveLineSettings} disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? "保存中…" : "設定を保存"}
                  </Button>
                </> :
                <Button onClick={login} disabled={loading} className="w-full bg-[#00be00]">
                  ログイン
                </Button>

                //   {loading ? "ログイン中…" : "ログイン"}
                // </Button>
              }
              <Button onClick={() => onClick()} disabled={loading} className="w-full bg-gray-300 hover:bg-gray-700">
                キャンセル
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div >
  );
}
