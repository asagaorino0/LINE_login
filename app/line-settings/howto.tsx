// app/line-settings/howto.tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Pen } from "lucide-react";
import '../Timeline.css'

export default function Howto({ onClick }: { onClick: () => void }) {
  const [loading, setLoading] = useState(false);


  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header>
        <div className="mx-auto w-full px-4 py-4 sm:max-w-2xl md:max-w-6xl lg:max-w-6xl xl:max-w-7xl">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 lg:text-xl">
              LINE Official Account Manager の「オーディエンス機能」設定方法
            </h3>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full px-4 pb-4 sm:max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl">
        {/* 設定カード */}
        <Card className="mb-8">
          <CardContent className="py-4">
            <div className="flex items-center space-x-3 my-3 ">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900">
                1. Googleフォーム回答から LINE User ID をCSVに保存</h4>
            </div>

            <div className="space-y-2">
              <label htmlFor="channelSecret" className="text-sm font-medium text-gray-700">
                <p>1. Googleフォームの回答スプレッドシートを開く</p><br />
                <p>2. メッセージを送りたいユーザーだけを絞り込む</p><br />
                <p>3. LINE User ID（質問1）の列だけを残す</p><br />
                <p>4. 重複が無いように整理し、1行目の「LINE User ID」という見出しは入れずに、IDだけをExcel又はWordにコピペする</p><br />
                <span>5. 「名前を付けて保存」でファイル形式は、<strong>.csv</strong>（Excel）又は<strong>.txt</strong>（（Word）で保存する</span><br />
                <span style={{ color: 'red' }}> ⚠️ IDのみ １行目「LINE User ID」は不要、ID重複厳禁</span>
              </label>
            </div>
          </CardContent>
        </Card>
        <Card className="mb-8">
          <CardContent className="py-4">
            <div className="flex items-center space-x-3 my-3 mt-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900">
                2. LINE Official Account Manager（管理画面）でオーディエンス作成</h4>
            </div>
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
                  先ほど作った .csv（又は.txt）ファイルをアップロード ＞ <strong> 更新 </strong>
                </p>
              </label>
            </div>
          </CardContent>
        </Card>
        <Card className="mb-8">
          <CardContent className="py-4">
            <div className="flex items-center space-x-3 my-3 mt-4">
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
                  <span>オーディエンスの </span>
                  <Pen className="inline w-4 h-4 text-gray-600 align-text-bottom" />
                  <span> アイコンをクリック</span> ＞ リストから該当の<strong> 含める </strong>を選択 ＞ <strong> 追加 </strong>
                </p><br />
                <p>3. メッセージ内容を入力して 配信</p>
              </label>
            </div>
          </CardContent>
        </Card>
        <Button onClick={() => onClick()} disabled={loading} className="w-full bg-gray-300 hover:bg-green-700 my-6">
          管理者モードへ
        </Button>
      </main>
    </div >
  );
}
