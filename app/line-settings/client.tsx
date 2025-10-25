// app/line-settings/client.tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, EllipsisVertical, Plus, Trash2 } from "lucide-react";
import "../Timeline.css";

/* ------------------------------ GAS builder ------------------------------ */
/**
 * 注意:
 * - String.raw は使わない（` や ${...} に余計なバックスラッシュが入るのを防ぐ）
 * - GAS 側に渡したい `${...}` は `${'${'} ... ${'}'}` と書いて“文字”として出力する
 * - 生成するのは「GAS にコピペするための 1 本の文字列」です
 */
type GasLinkKind = "form" | "sheet";

function buildGasCode(params: { titles: string[]; linkKind: GasLinkKind; formTitle?: string }) {
  const { titles, linkKind } = params;

  // フォールバック & エスケープ
  const formTitleSafe = (params.formTitle?.trim() || "Googleフォーム")
    .replace(/\\/g, "\\\\")   // バックスラッシュ
    .replace(/`/g, "\\`")     // バッククォート
    .replace(/\$/g, "\\$");   // ${...} 崩れ対策

  // 空・重複・前後空白を整理
  const cleaned = Array.from(
    new Set(
      titles
        .map((t) => (t || "").trim())
        .filter((t) => t.length > 0)
    )
  );
  const fallbackTitles = cleaned.length > 0 ? cleaned : ["お名前"];

  // GAS に埋め込むタイトル配列リテラル
  const TITLES_ARRAY_LITERAL = `[${fallbackTitles
    .map((t) => JSON.stringify(t))
    .join(", ")}]`;

  const SHEET_FIELD_BLOCK =
    linkKind === "sheet"
      ? `
        <label>回答スプレッドシートURL（通知リンクに使用、任意）：</label><br>
        <input type="text" id="sheeturl" style="width:100%" value="${'${'}props.getProperty('SHEET_URL') || ''${'}'}"><br><br>`
      : "";

  const SHEET_SAVE_LINE =
    linkKind === "sheet"
      ? `if (typeof data.sheeturl !== 'undefined') props.setProperty('SHEET_URL', data.sheeturl || '');`
      : "";

  const SHEET_PROP_LINE =
    linkKind === "sheet"
      ? `const SHEET_URL = props.getProperty('SHEET_URL') || '';`
      : "";

  const JUMP_LINK_EXPR = linkKind === "sheet" ? `(SHEET_URL || FORM_URL)` : `FORM_URL`;

  // ここで返すのは“GASに貼る文字列”
  return `// === 設定を保存するためのスクリプトプロパティ ===
const props = PropertiesService.getScriptProperties();

// === 設定画面（任意） ===
// ※ 画面で設定を保存したい場合だけ使います。使わない場合は無視してOK。
function doGet() {
  const html = \`
  <html>
    <body style="font-family:sans-serif;padding:20px;line-height:1.6;">
      <h2 style="margin:0 0 8px;">Googleフォーム通知設定</h2>
      <p style="margin:0 0 16px;">
        <a href="https://developers.line.biz/console/" target="_blank" style="color:#2563eb;text-decoration:underline;">
          LINE Developers Console
        </a>
        で取得した値を入力してください。
      </p>

      <form id="configForm">
        <!-- あなたのユーザーID -->
        <label><strong>あなたのユーザーID *</strong></label><br>
        <input
          type="text"
          id="user"
          placeholder="例: Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;"
          value="${'${'}props.getProperty('LINE_USER_ID') || ''${'}'}"
        ><br><br>
        <!-- チャンネルアクセストークン（長期） -->
        <label><strong>チャンネルアクセストークン（長期） *</strong></label><br>
        <input
          type="text"
          id="token"
          placeholder="例: xxxxxxxx..."
          style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;"
          value="${'${'}props.getProperty('LINE_TOKEN') || ''${'}'}"
        ><br>
        <div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">
          Messaging API 設定から発行／再発行できます。
        </div>

        <!-- 通知で開くURL（フォーム/回答シートなど） -->
        <label>通知で開くURL（フォーム/回答シートなど）</label><br>
        <input
          type="text"
          id="formurl"
          placeholder="例: フォームのURL または 回答スプレッドシートのURL"
          style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;"
          value="${'${'}props.getProperty('FORM_URL') || ''${'}'}"
        ><br><br>
        ${SHEET_FIELD_BLOCK}

        <button
          type="button"
          onclick="saveConfig()"
          style="padding:10px 16px;background:#16a34a;color:#fff;border:none;border-radius:6px;cursor:pointer;"
        >
          保存
        </button>
      </form>
      <script>
        function saveConfig() {
          const data = {
            user: document.getElementById('user').value,
            token: document.getElementById('token').value,
            formurl: document.getElementById('formurl').value,${linkKind === "sheet" ? `
            sheeturl: document.getElementById('sheeturl').value,` : ""}
          };
          google.script.run.withSuccessHandler(() => alert('保存しました')).saveSettings(data);
        }
      </script>
    </body>
  </html>\`;
  return HtmlService.createHtmlOutput(html);
}

// === 設定を保存 ===
function saveSettings(data) {
  props.setProperty('LINE_TOKEN', data.token || '');
  props.setProperty('LINE_USER_ID', data.user || '');
  props.setProperty('FORM_URL', data.formurl || '');
  ${SHEET_SAVE_LINE}
}

// === フォーム送信時の通知 ===
function onFormSubmit(e) {
  const LINE_TOKEN = props.getProperty('LINE_TOKEN') || '';
  const LINE_USER_ID = props.getProperty('LINE_USER_ID') || '';
  const FORM_URL = props.getProperty('FORM_URL') || '';
  ${SHEET_PROP_LINE}

  // 抽出する設問タイトル（複数）
  const TARGET_TITLES = ${TITLES_ARRAY_LITERAL};

  const items = e.response.getItemResponses();

  // タイトル -> 回答 のマップを作る
  const answers = {};
  TARGET_TITLES.forEach(t => answers[t] = ''); // 初期化

  items.forEach(item => {
    const title = item.getItem().getTitle();
    if (TARGET_TITLES.indexOf(title) >= 0) {
      answers[title] = item.getResponse();
    }
  });

  // 通知本文を構築
  let lines = ['📩 回答：${formTitleSafe}'];
  TARGET_TITLES.forEach(t => {
    const v = answers[t] || '（未入力）';
    lines.push('📝 ' + t + '：' + v);
  });

  const jumpLink = ${JUMP_LINK_EXPR};
  lines.push('');
  lines.push('📄 回答を見る：' + (jumpLink || '(未設定)'));
  const msg = lines.join('\\n');

  sendLineMessage(LINE_TOKEN, LINE_USER_ID, msg);
}

// === LINE通知送信 ===
function sendLineMessage(token, user, message) {
  if (!token || !user) {
    Logger.log('token/user が未設定のため送信しません');
    return;
  }
  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = { to: user, messages: [{ type: 'text', text: message }] };
  const options = {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  const res = UrlFetchApp.fetch(url, options);
  Logger.log('LINE push status: %s, body: %s', res.getResponseCode(), res.getContentText());
}
`;
}

/* ------------------------------ Component ------------------------------ */

export default function LineSettingsClient({ formTitle = "Googleフォーム" }: { formTitle?: string }) {
  // 複数タイトルを管理
  const [titles, setTitles] = useState<string[]>(["お名前"]);
  const [linkKind, setLinkKind] = useState<GasLinkKind>("form");

  const gasCode = useMemo(
    () => buildGasCode({ titles, linkKind, formTitle }),
    [titles, linkKind, formTitle]
  );

  // タイトル行を追加
  const addTitle = () => {
    setTitles((prev) => [...prev, ""]);
  };

  // タイトル行を削除
  const removeTitle = (idx: number) => {
    setTitles((prev) => prev.filter((_, i) => i !== idx));
  };

  // タイトル行の更新
  const updateTitle = (idx: number, v: string) => {
    setTitles((prev) => prev.map((t, i) => (i === idx ? v : t)));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 pb-4">
        <div className="mb-4">
          <p className="text-gray-600">
            下のコードを<strong>フォームの Apps Script</strong>にコピペ → 保存 →
            左メニュー「トリガー」で <code className="mx-1">onFormSubmit</code> を <strong>フォーム送信時</strong> に設定してください。
          </p>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Googleフォーム通知用 GAS コード生成</h3>
              </div>
            </div>

            {/* 抽出する設問タイトル（複数） */}
            <div className="space-y-2 mb-3">
              <label className="text-sm font-medium text-gray-700">抽出する設問タイトル（複数可）</label>

              <div className="space-y-2">
                {titles.map((title, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder={`例：設問タイトル ${idx + 1}`}
                      value={title}
                      onChange={(e) => updateTitle(idx, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeTitle(idx)}
                      title="この行を削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div>
                <Button type="button" variant="secondary" onClick={addTitle}>
                  <Plus className="h-4 w-4 mr-1" />
                  タイトル行を追加
                </Button>
              </div>

              <p className="text-xs text-gray-500">
                ※ フォーム側の設問タイトルと<strong>完全一致</strong>で抽出します。通知には、ここで指定した順に各設問の値が表示されます。
              </p>
            </div>

            {/* 通知リンク種別 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">通知リンク</label>
                <select
                  className="w-full p-2 border rounded text-sm"
                  value={linkKind}
                  onChange={(e) => setLinkKind(e.target.value as GasLinkKind)}
                >
                  <option value="form">フォームURL（既定）</option>
                  <option value="sheet">回答スプレッドシートURL（運用向け）</option>
                </select>
                {/* <p className="text-xs text-gray-500">
                  回答一覧へ直接飛びたい場合は「スプレッドシート」を選択し、GASの設定画面でシートURLを保存してください。
                </p> */}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-700"></label>
                <p className="text-xs text-gray-500">
                  <br /> <br />
                  回答一覧へ直接飛びたい場合は「スプレッドシート」を選択し、GASの設定画面でシートURLを保存してください。
                </p>
              </div>
            </div>

            {/* 生成コード */}
            <textarea
              className="w-full font-mono text-xs border rounded p-3 bg-gray-900 text-green-200"
              style={{ minHeight: 360 }}
              readOnly
              value={gasCode}
            />
            <div className="flex gap-2 flex-wrap mt-2">
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(gasCode);
                  alert("コードをコピーしました");
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                コードをコピー
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 設定ガイド */}
        <div className="mt-8 space-y-4 text-sm text-gray-700 leading-relaxed">
          <h3 className="text-base font-semibold">📘 Googleフォーム通知の設定手順</h3>

          <ol className="list-decimal ml-5 space-y-3">
            <li>
              <strong>フォームを開く → スクリプトエディタを起動</strong><br />
              Googleフォームを開き、右上の{" "}
              <EllipsisVertical className="inline w-4 h-4 text-gray-500" />（その他） →{" "}
              <strong>「スクリプトエディタ」</strong> をクリックします。<br />
              → Google Apps Script の画面が開きます。
            </li>

            <li>
              <strong>コードを貼り付ける</strong><br />
              生成されたコード（この画面の「コードをコピー」ボタンで取得）を、
              Apps Script のエディタ画面に<strong>全て貼り付け</strong>し、保存（⌘S / Ctrl+S）。<br />
              <span className="text-gray-500 text-xs">
                ※ 初期状態にある <code>function myFunction() {'{ }'}</code> は削除してください。
              </span>
            </li>

            <li>
              <strong>デプロイ（ウェブアプリとして公開）</strong><br />
              右上の <strong>「デプロイ ▾」 → 「新しいデプロイ」</strong> を選択。<br />
              <ul className="list-disc ml-5">
                <li>「種類を選択」→ <strong>ウェブアプリ</strong></li>
                <li>「実行するユーザー」→ <strong>自分</strong></li>
                <li>「アクセスできるユーザー」→ <strong>自分のみ</strong>（または組織内）</li>
              </ul>
              最後に <strong>「デプロイ」</strong> を押し、表示された URL を開きます。
            </li>

            <li>
              <strong>設定画面を開く → 値を入力 → 保存</strong><br />
              ブラウザでウェブアプリのURLを開くと、
              <strong>チャンネルアクセストークン（長期） * / あなたのユーザーID * / 通知リンクURL</strong> の入力フォームが表示されます。<br />
              値を入力して「保存」を押せばGAS内部に保存され、フォーム送信時に通知で使われます。
            </li>

            <li>
              <strong>トリガーを設定</strong><br />
              Apps Script 画面左側の時計アイコン（トリガー） → <strong>「トリガーを追加」</strong><br />
              関数を <strong><code>onFormSubmit</code></strong>、イベントの種類を <strong>フォーム送信時</strong> に設定します。
            </li>

            <li>
              <strong>動作確認</strong><br />
              ① <strong><code>testPush()</code></strong> を使って、LINE 通知が正しく届くか確認します。<br />
              <span className="text-gray-600 text-sm leading-relaxed">
                まず、エディタ上部の「関数を選択」メニューを開き、<strong><code>testPush</code></strong> を選んでください。<br />
                次に ▶️（実行）ボタンを押します。<br />
                初めて実行するときは、Google アカウントの承認が必要です。<br />
                「権限を確認」→「詳細」→「（安全でないページに進む）」→「許可」と進んでください。<br />
                実行が完了すると、画面下の「実行ログ」に <code>LINE push status: 200</code> と表示されれば成功です。<br />
                数秒後に、ご自身の LINE に「テスト送信です…」というメッセージが届きます。<br />
                もし届かない場合は、LINE Developers Console の「アクセストークン」や「ユーザーID」が正しいか確認しましょう。
              </span><br />
              ② 実際にフォームに回答してみて、LINE 通知が届くか確認します。
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}

export const runtime = "nodejs";
