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

  // フォーム名（未指定なら「新しいフォーム回答」）を GAS の文字列に安全に埋め込む
  const formTitleSafe = (params.formTitle?.trim() || "新しいフォーム回答")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  // 通知に並べたい設問タイトル
  const cleaned = Array.from(new Set((titles || []).map((t) => (t || "").trim()).filter((t) => t.length > 0)));
  const fallbackTitles = cleaned.length > 0 ? cleaned : ["お名前"];
  const TITLES_ARRAY_LITERAL = `[${fallbackTitles.map((t) => JSON.stringify(t)).join(", ")}]`;

  // シートURLを通知リンクに使うオプション
  const SHEET_FIELD_BLOCK =
    linkKind === "sheet"
      ? `
        <label>回答スプレッドシートURL（通知リンクに使用、任意）：</label><br>
        <input type="text" id="sheeturl" style="width:100%" value="\${props.getProperty('SHEET_URL') || ''}"><br><br>`
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

  // ✅ testPush() を壊れない固定ブロックとして生成
  const TEST_PUSH_BLOCK = `
// ================= 動作確認（管理者へテストFlex送信） =================
function testPush(){
  const LINE_TOKEN = props.getProperty('LINE_TOKEN') || '';
  const LINE_USER_ID = props.getProperty('LINE_USER_ID') || '';
  const FORM_URL = props.getProperty('FORM_URL') || '';

  // ※ここを実際のお客様UIDに変えると、その人に送信できます
  const dummyTargetUid = 'Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

  const demo = buildFlexMessage(
    formName(),
    '山田太郎', // LINE名（カード表示用）
    'https://dummyimage.com/240x240',
    ['お名前：折野'], // 本文（設問表示のサンプル）
    FORM_URL,         // 「回答を見る」リンク
    dummyTargetUid,   // 「メッセージを送る」宛先UID（ダミー）
    '折野'            // フォーム回答名（「◯◯ に送る…」の◯◯）
  );

  sendLinePush(LINE_TOKEN, LINE_USER_ID, [demo]);
}
`;

  // === GAS へ貼り付ける 1 本のコード文字列 ===
  return `// === 設定（スクリプトプロパティ） ===
const props = PropertiesService.getScriptProperties();

// === 設定画面（任意） ===
function doGet() {
const html = \`
<html><body style="font-family:sans-serif;padding:20px;line-height:1.6;">
<h2 style="margin:0 0 8px;">Googleフォーム通知設定</h2>
<form id="configForm">
<label><strong>あなたのユーザーID（管理者） *</strong></label><br>
<input id="user" style="width:100%" value="\\\${props.getProperty('LINE_USER_ID') || ''}"><br><br>

<label><strong>チャンネルアクセストークン（長期） *</strong></label><br>
<input id="token" style="width:100%" value="\\\${props.getProperty('LINE_TOKEN') || ''}"><br><br>

<label><strong>チャンネルシークレット（Webhook用・推奨）</strong></label><br>
<input id="secret" style="width:100%" value="\\\${props.getProperty('LINE_CHANNEL_SECRET') || ''}"><br><br>

<label>通知で開くURL（フォーム/回答シートなど）</label><br>
<input id="formurl" style="width:100%" value="\\\${props.getProperty('FORM_URL') || ''}"><br><br>
${SHEET_FIELD_BLOCK}
<button type="button" onclick="saveConfig()">保存</button>
</form>

<script>
function saveConfig(){
const data = {
user: document.getElementById('user').value,
token: document.getElementById('token').value,
secret: document.getElementById('secret').value,
formurl: document.getElementById('formurl').value,${linkKind === "sheet" ? `
sheeturl: document.getElementById('sheeturl').value,` : ""} 
};
google.script.run.withSuccessHandler(() => alert('保存しました')).saveSettings(data);
}
</script>
</body></html>\`;
return HtmlService.createHtmlOutput(html);
}

function saveSettings(data){
props.setProperty('LINE_TOKEN', data.token || '');
props.setProperty('LINE_USER_ID', data.user || '');
props.setProperty('LINE_CHANNEL_SECRET', data.secret || '');
props.setProperty('FORM_URL', data.formurl || '');
${SHEET_SAVE_LINE}
}

/** ================= プロフィール取得（UID→displayName/pictureUrl） ================= */
function getLineProfile(lineToken, userId){
  if (!lineToken || !userId) return null;
  try {
    const url = 'https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId);
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + lineToken },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      Logger.log('profile fetch NG: %s %s', res.getResponseCode(), res.getContentText());
      return null;
    }
    return JSON.parse(res.getContentText()); // {userId, displayName, pictureUrl, statusMessage}
  } catch (e) {
    Logger.log('profile fetch error: %s', e);
    return null;
  }
}

/** 回答から UID を推定（タイトル一致 or 値から正規表現） */
function extractUidFromResponses(items){
  const UID_TITLE_HINTS = ['LINE User ID','LINEユーザーID','LINE UID','ユーザーID','uid'];
  var uid = '';
  // 1) タイトルで探す
  for (var i=0;i<items.length;i++){
    var it = items[i];
    var title = String(it.getItem().getTitle() || '').trim();
    var resp = String(it.getResponse() || '').trim();
    // タイトルが完全一致または部分一致
    for (var j=0;j<UID_TITLE_HINTS.length;j++){
      if (title.indexOf(UID_TITLE_HINTS[j]) >= 0) {
        uid = resp;
        break;
      }
    }
    if (uid) break;
  }
  // 2) タイトルで見つからなければ、値から正規表現でUID抽出
  if (!uid) {
    for (var i=0;i<items.length;i++){
      var resp = String(items[i].getResponse() || '').trim();
      var m = resp.match(/^U[0-9a-f]{32,}$/i);
      if (m) {
        uid = m[0];
        break;
      }
    }
  }
  // 3) デバッグログ
  if (uid) {
    Logger.log('[UID抽出成功] ' + uid);
  } else {
    Logger.log('[UID抽出失敗] すべての回答を確認しましたがUIDが見つかりませんでした');
  }
  return uid;
}

/** ========== フォーム名のヘルパー（指定が無ければ「新しいフォーム回答」） ========== */
const FORM_TITLE = '${formTitleSafe}';
function formName(){ return (FORM_TITLE && FORM_TITLE.trim()) ? FORM_TITLE.trim() : '新しいフォーム回答'; }

  // ================= postback data パース =================
  function parsePostbackData_(data) {
  const params = {};
  String(data || '').split('&').forEach(function (kv) {
  const sp = kv.split('=');
  const k = decodeURIComponent(sp[0] || '').trim();
  const v = decodeURIComponent(sp.slice(1).join('=') || '').trim();
  if (k) params[k] = v;
  });
  return params;
  }

// ================= 状態保存キー：管理者→送信先UID/名前 =================
function pendingKey_(adminUid) {
return 'PENDING_TARGET_' + adminUid;
}

// ================= Flexメッセージ（「回答を見る」＋「メッセージを送る」ボタン） =================
function buildFlexMessage(formTitleText, displayName, pictureUrl, textLines, jumpLink, targetUid, targetName) {
// ヘッダは「回答：<フォーム名>（<LINE名>）」
var headerText = '回答：' + (formTitleText || '新しいフォーム回答') + (displayName ? '（' + displayName + '）' : '');

var bodyTexts = textLines.map(function (t) {
return { type: 'text', text: String(t), wrap: true, size: 'sm', color: '#333333' };
});

// 四角いアイコン（そのまま）
var leftImage = (pictureUrl && /^https?:\\/\\//i.test(pictureUrl))
? { type: 'image', url: pictureUrl, size: 'xxs', aspectMode: 'cover', aspectRatio: '1:1', flex: 0 }
: { type: 'filler', flex: 0 };

var headerRow = {
type: 'box',
layout: 'horizontal',
spacing: 'md',
alignItems: 'center',
contents: [
leftImage,
{ type: 'box', layout: 'vertical', contents: [
{ type: 'text', text: headerText, weight: 'bold', wrap: true }
]}
]
};

var contents = [
headerRow,
{ type: 'separator', margin: 'md' },
{ type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyTexts }
];

  var buttons = [];

if (jumpLink) {
  buttons.push({
  type: 'button',
  style: 'link',
  action: { type: 'uri', label: '回答を見る', uri: jumpLink }
  });
  }

  // ★ここでフォーム回答名も一緒に postback data に入れる
  if (targetUid) {
    var safeName = encodeURIComponent(String(targetName || '').trim());
    buttons.push({
      type: 'button',
      style: 'primary',
      action: {
        type: 'postback',
        label: 'メッセージを送る',
        data: 'action=compose&uid=' + encodeURIComponent(targetUid) + '&name=' + safeName
      }
    });
  }

  if (buttons.length > 0) {
  contents.push({ type: 'separator', margin: 'md' });
  contents.push({
  type: 'box',
  layout: 'vertical',
  spacing: 'sm',
  contents: buttons
  });
  }

return {
type: 'flex',
altText: headerText,
contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: contents } }
};
}
// ================= 送信エントリーポイント（フォーム送信時） =================
function onFormSubmit(e) {
const LINE_TOKEN = props.getProperty('LINE_TOKEN') || '';
const LINE_USER_ID = props.getProperty('LINE_USER_ID') || '';
const FORM_URL = props.getProperty('FORM_URL') || '';
${SHEET_PROP_LINE}
// 通知に含める設問
const TARGET_TITLES = ${TITLES_ARRAY_LITERAL};
// 回答を読む
const items = e.response.getItemResponses();
var answers = {};
TARGET_TITLES.forEach(function(t){ answers[t] = ''; });
items.forEach(function(item){
var title = item.getItem().getTitle();
if (TARGET_TITLES.indexOf(title) >= 0) {
answers[title] = item.getResponse();
}
});
// 本文行：「<フォーム名>\\n\\n<設問：回答>」の形式
var lines = [];
TARGET_TITLES.forEach(function(t){
var v = answers[t] || '（未入力）';
lines.push( t + '：' + v);
});

// UID→プロフィール取得（displayName / pictureUrl）
var targetName = String(answers["お名前"] || '').trim();
if (!targetName) targetName = 'お客様';

// お客様の LINE userId（フォーム内に入っている前提）
var uid = extractUidFromResponses(items);

// （カード上部の括弧内表示は LINE名）
var prof = uid ? getLineProfile(LINE_TOKEN, uid) : null;
var displayName = prof && prof.displayName ? String(prof.displayName) : '';
var pictureUrl = prof && prof.pictureUrl ? String(prof.pictureUrl) : '';
// デバッグログ
if (!uid) {
Logger.log('[警告] UIDが抽出できませんでした。プロフィール情報なしで送信します。');
} else if (!prof) {
Logger.log('[警告] UID=' + uid + ' のプロフィール取得に失敗しました。');
} else {
Logger.log('[成功] プロフィール取得: ' + displayName + ' / アイコン=' + (pictureUrl ? 'あり' : 'なし'));
}

  // Flex生成
  var jumpLink = ${JUMP_LINK_EXPR};

  var flex = buildFlexMessage(formName(), displayName, pictureUrl, lines, jumpLink, uid, targetName);

// 送信（Flex 1通／失敗時はテキスト）
 try {
sendLinePush(LINE_TOKEN, LINE_USER_ID, [flex]);
} catch (err) {
var headerText = '回答：' + formName() + (displayName ? '（' + displayName + '）' : '');
var textMsg = headerText + '\\n' + lines.join('\\n') + (jumpLink ? ('\\n\\n📄 回答を見る：' + jumpLink) : '');
sendLinePush(LINE_TOKEN, LINE_USER_ID, [{ type: 'text', text: textMsg }]);
}
}

// ================= Webhook用：reply送信 =================
function sendLineReply_(token, replyToken, messages) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = { replyToken: replyToken, messages: messages };
  const res = UrlFetchApp.fetch(url, {
  method: 'post',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
  payload: JSON.stringify(payload),
  muteHttpExceptions: true
  });
  Logger.log('reply status: %s body: %s', res.getResponseCode(), res.getContentText());
  }

/** 複数メッセージ送信 */
function sendLinePush(token, toUser, messages){
if (!token || !toUser) {
Logger.log('token/user 未設定のため送信せず');
return;
}
const url = 'https://api.line.me/v2/bot/message/push';
const payload = { to: toUser, messages: messages };
const options = {
method: 'post',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
payload: JSON.stringify(payload),
muteHttpExceptions: true
};
const res = UrlFetchApp.fetch(url, options);
Logger.log('push status: %s body: %s', res.getResponseCode(), res.getContentText());
}

// ================= LINE Webhook（管理者の操作を受け取る） =================
function doPost(e) {
  const LINE_TOKEN = props.getProperty('LINE_TOKEN') || '';
  if (!LINE_TOKEN) return ContentService.createTextOutput('NO_TOKEN');

  const rawBody = e.postData && e.postData.contents ? e.postData.contents : '';

  let body = {};
  try {
  body = JSON.parse(rawBody || '{}');
  } catch (err) {
  Logger.log('bad json: %s', err);
  return ContentService.createTextOutput('BAD_JSON');
  }

  const events = body.events || [];
  events.forEach(function (ev) {
  const type = ev.type;
  const adminUid = ev.source && ev.source.userId ? String(ev.source.userId) : '';
  const replyToken = ev.replyToken;

  // 1) 管理者がボタンを押した（postback）
  if (type === 'postback') {
  const data = ev.postback && ev.postback.data ? ev.postback.data : '';
  const p = parsePostbackData_(data);

  if (p.action === 'compose') {
  const targetUid = p.uid || '';
  const targetName = (p.name ? String(p.name) : '').trim() || 'お客様';

  if (!adminUid || !targetUid) {
  sendLineReply_(LINE_TOKEN, replyToken, [{ type: 'text', text: 'UIDが取得できず開始できませんでした。' }]);
  return;
  }

  // 入力待ち状態を保存
  props.setProperty(
  pendingKey_(adminUid),
  JSON.stringify({ uid: targetUid, name: targetName })
  );

  // 入力案内（改行は \\n）
  sendLineReply_(LINE_TOKEN, replyToken, [{
  type: 'text',
  text: targetName + 
  ' に送るメッセージを入力してください。\\n（キャンセルする場合は「キャンセル」と送ってください）'
  }]);

  return;
  }

  return;
  }

  // 2) 管理者がテキストを送った → その内容をお客様へpush
  if (type === 'message' && ev.message && ev.message.type === 'text') {
  const text = String(ev.message.text || '').trim();
  if (!adminUid) return;

  const key = pendingKey_(adminUid);
  const raw = props.getProperty(key) || '';
  if (!raw) return; // 入力待ちじゃないなら無視

  let data = null;
  try {
  data = JSON.parse(raw);
  } catch (err) {
  props.deleteProperty(key);
  return;
  }

  const targetUid = data.uid || '';
  const targetName = data.name || 'お客様';
  if (!targetUid) {
  props.deleteProperty(key);
  return;
  }

  // キャンセル
  if (text === 'キャンセル' || text.toLowerCase() === 'cancel') {
  props.deleteProperty(key);
  sendLineReply_(LINE_TOKEN, replyToken, [{ type: 'text', text: 'キャンセルしました。' }]);
  return;
  }

  // お客様へ送信（push）
  sendLinePush(LINE_TOKEN, targetUid, [{ type: 'text', text: text }]);

  // 管理者へ完了通知（reply）
  sendLineReply_(LINE_TOKEN, replyToken, [{ type: 'text', text: targetName + ' へ送信しました✅' }]);

  // 状態クリア
  props.deleteProperty(key);
  return;
  }
  });

  return ContentService.createTextOutput('OK');
}

${TEST_PUSH_BLOCK}
`;
}

/* ------------------------------ Component ------------------------------ */

export default function LineSettingsClient({ formTitle }: { formTitle?: string }) {
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
            左メニュー「トリガー」で{" "}
            <code className="mx-1">onFormSubmit</code> を <strong>フォーム送信時</strong> に設定してください。
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
              <strong>フォームを開く → スクリプトエディタを起動</strong>
              <br />
              Googleフォームを開き、右上の{" "}
              <EllipsisVertical className="inline w-4 h-4 text-gray-500" />
              （その他） → <strong>「スクリプトエディタ」</strong> をクリックします。
              <br />
              → Google Apps Script の画面が開きます。
            </li>

            <li>
              <strong>コードを貼り付ける</strong>
              <br />
              生成されたコード（この画面の「コードをコピー」ボタンで取得）を、Apps Script のエディタ画面に<strong>全て貼り付け</strong>し、保存（⌘S / Ctrl+S）。
              <br />
              <span className="text-gray-500 text-xs">
                ※ 初期状態にある <code>function myFunction() {"{ }"}</code> は削除してください。
              </span>
            </li>

            <li>
              <strong>デプロイ（ウェブアプリとして公開）</strong>
              <br />
              右上の <strong>「デプロイ ▾」 → 「新しいデプロイ」</strong> を選択。
              <br />
              <ul className="list-disc ml-5">
                <li>「種類を選択」→ <strong>ウェブアプリ</strong></li>
                <li>「実行するユーザー」→ <strong>自分</strong></li>
                <li>「アクセスできるユーザー」→ <strong>全員</strong></li>
              </ul>
              最後に <strong>「デプロイ」</strong> を押し、表示された URL をコピー　＆　リンクを開きます。
            </li>
            <li>
              <strong>設定画面を開く → 値を入力 → 保存</strong>
              <br />
              ブラウザでウェブアプリのURLを開くと、
              <strong>あなたのユーザーID（管理者）） * / チャンネルアクセストークン（長期） * / チャンネルシークレット（Webhook用・推奨） / 通知リンクURL</strong> の入力フォームが表示されます。
              <br />
              値を入力して「保存」を押せばGAS内部に保存され、フォーム送信時に通知で使われます。
            </li>
            <li>
              <p className="text-sm text-gray-600">
                <a href="https://developers.line.biz/console/" target="blank" style={{ color: "blue" }}>
                  LINE Developers Console
                </a> にログイン
              </p>
              <strong>LINE Developers 側の設定</strong>
              <strong>「デプロイ」</strong>で出たURLを<strong>Webhook設定</strong>の<strong>Webhook URL</strong>に貼り付け
              <br />
              <strong>Webhookの利用：ON</strong>
            </li>
            <li>
              <strong>トリガーを設定</strong>
              <br />
              Apps Script 画面左側の時計アイコン（トリガー） → <strong>「トリガーを追加」</strong>
              <br />
              関数を <strong>
                <code>onFormSubmit</code>
              </strong>
              、イベントの種類を <strong>フォーム送信時</strong> に設定します。
            </li>

            <li>
              <strong>動作確認</strong>
              <br />
              ① <strong>
                <code>testPush()</code>
              </strong>{" "}
              を使って、LINE 通知が正しく届くか確認します。
              <br />
              <span className="text-gray-600 text-sm leading-relaxed">
                まず、エディタ上部の「関数を選択」メニューを開き、
                <strong>
                  <code>testPush</code>
                </strong>{" "}
                を選んでください。
                <br />
                次に ▶️（実行）ボタンを押します。
                <br />
                初めて実行するときは、Google アカウントの承認が必要です。
                <br />
                「権限を確認」→「詳細」→「（安全でないページに進む）」→「許可」と進んでください。
                <br />
                実行が完了すると、画面下の「実行ログ」に <code>LINE push status: 200</code> と表示されれば成功です。
                <br />
                数秒後に、ご自身の LINE にメッセージが届きます。
              </span>
              <br />
              ② 実際にフォームに回答してみて、LINE 通知が届くか確認します。
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}

export const runtime = "nodejs";
