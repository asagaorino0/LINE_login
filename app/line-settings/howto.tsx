// app/line-settings/client.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { liffManager } from "@/lib/liff";
import { apiRequest } from "../lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Key, Save, Settings, LogOut, ArrowLeft, Check, Pen } from "lucide-react";
import { useAuth } from "../lib/auth";
import { cn } from "@/lib/utils";
import '../Timeline.css'

export default function Howto({ onClick }: { onClick: () => void }) {
  const [lineSettings, setLineSettings] = useState({ channelName: "", channelSecret: "", channelAccessToken: "", liffId: "" });
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const didRunRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [value, setValue] = useState<string>("");

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
      {/* ヘッダー */}
      <header>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">LINE Official Account Manager の「オーディエンス機能」設定方法</h3>
            {/* <p className="text-base text-gray-600">
              <span className="M7eMe">
                <a href="https://manager.line.biz/" target="blank" style={{ color: "blue" }}>
                  LINE Official Account Manager
                </a>
              </span>
              へアクセス
            </p> */}
          </div>
        </div>
      </header>

      {/* メイン */}
      <main className="max-w-4xl mx-auto px-4 pb-4">
        {/* タイトル */}
        <div className="mb-4">
          {/* <h2 className="text-2xl font-bold text-gray-900 mb-2">LINE API設定</h2> */}
          {/* <p className="text-gray-600">
            設定後、<strong>フォーム回答通知機能</strong>が利用可能になります。
          </p> */}
        </div>

        {/* 設定カード */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3 my-3 ">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900">
                1. Googleフォーム回答から LINE User ID をCSVに保存</h4>
            </div>
            {/* <div className="space-y-6"> */}
            <div className="space-y-2">
              <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">
                <p>1. Googleフォームの回答スプレッドシートを開く</p><br />
                <p>2. メッセージを送りたいユーザーだけを絞り込む</p><br />
                <p>3. LINE User ID（質問1）の列だけを残す</p><br />
                <p>4. 1行目の「LINE User ID」という見出しは削除する</p><br />
                <span>5. CSV形式で保存する</span><br />
                <span style={{ color: 'red' }}> ⚠️ IDのみ １行目「LINE User ID」は不要</span>
              </label>
              {/* <Input
                  id="channelSecret"
                  type="text"
                  placeholder="チャネル名を入力"
                  value={lineSettings.channelName}
                  onChange={(e) => { setLineSettings({ ...lineSettings, channelName: e.target.value }), setValue("1") }}
                /> */}
              {/* <p className="text-xs text-gray-500">LINE Developers Console →  <strong>チャンネル基本設定</strong> → <strong>基本情報</strong> 内</p> */}
            </div>

            <div className="flex items-center space-x-3 my-3 mt-6">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900">
                2. LINE Official Account Manager（管理画面）でオーディエンス作成</h4>
            </div>
            {/* <div className="space-y-6"> */}
            <div className="space-y-2">
              <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">
                <p>1. <a href="https://manager.line.biz/" target="blank" style={{ color: "blue" }}>
                  LINE Official Account Manager
                </a> にログイン → https://manager.line.biz/</p><br />
                <p>2. 左メニューから<br />
                  <strong>　ホーム</strong> ＞ データ管理の<strong> オーディエンス </strong></p> <br />
                <p>3. <strong> 作成</strong> ＞ <strong>選択</strong> ＞ <strong>ユーザーIDアップロード</strong> ＞ オーディエンス名（適宜設定）＞
                  <strong> 次へ</strong></p><br />
                <p>4. ターゲット設定の<strong> ファイルを選択 </strong>で
                  先ほど作った .csv ファイルをアップロード ＞ <strong> 更新 </strong>
                </p>
              </label>
              {/* <Input
                  id="channelSecret"
                  type="text"
                  placeholder="チャネル名を入力"
                  value={lineSettings.channelName}
                  onChange={(e) => { setLineSettings({ ...lineSettings, channelName: e.target.value }), setValue("1") }}
                /> */}
              {/* <p className="text-xs text-gray-500">LINE Developers Console →  <strong>チャンネル基本設定</strong> → <strong>基本情報</strong> 内</p> */}
            </div>

            <div className="flex items-center space-x-3 my-3 mt-6">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900">
                3. メッセージ作成時にオーディエンスを指定</h4>
            </div>
            {/* <div className="space-y-6"> */}
            <div className="space-y-2">
              <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">
                <p>1. 左メニューから メッセージ配信の <strong>メッセージを作成</strong>へ進む</p><br />
                <p>
                  2. 配信先：<strong> 絞り込み </strong> を選択<br />
                  オーディエンスの
                  <Pen className="inline w-4 h-4 text-gray-600 align-text-bottom" />
                  アイコンをクリック ＞ リストから該当の<strong> 含める </strong>を選択 ＞ <strong> 追加 </strong>
                </p><br />
                <p>3. メッセージ内容を入力して 配信</p>


              </label>
              {/* <Input
                  id="channelSecret"
                  type="text"
                  placeholder="チャネル名を入力"
                  value={lineSettings.channelName}
                  onChange={(e) => { setLineSettings({ ...lineSettings, channelName: e.target.value }), setValue("1") }}
                /> */}
              {/* <p className="text-xs text-gray-500">LINE Developers Console →  <strong>チャンネル基本設定</strong> → <strong>基本情報</strong> 内</p> */}
            </div>

            {/* <div className="space-y-2">
              <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">チャンネルシークレット *</label>
              <Input
                id="channelSecret"
                type="password"
                placeholder="チャンネルシークレットを入力"
                value={lineSettings.channelSecret}
                onChange={(e) => { setLineSettings({ ...lineSettings, channelSecret: e.target.value }), setValue("2") }}
              />
              <p className="text-xs text-gray-500">LINE Developers Console →  <strong>チャンネル基本設定</strong> → <strong>基本情報</strong> 内</p>
            </div> */}



            {/* </div> */}
          </CardContent>
        </Card>
        <Button onClick={() => onClick()} disabled={loading} className="w-full bg-gray-300 hover:bg-green-700 my-6">
          管理者モードへ
        </Button>
      </main>
    </div >
  );
}
