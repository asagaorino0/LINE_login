// app/api/line/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { Client, FlexMessage, Message } from '@line/bot-sdk';

type Body = {
  userId?: string;
  message?: string;
  type?: 'text' | 'card';
  formUrl?: string;
  title?: string;
};

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

function json(status: number, data: unknown) {
  return NextResponse.json(data, { status });
}

function assertEnv() {
  if (!ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  }
}

function createClient() {
  assertEnv();
  return new Client({ channelAccessToken: ACCESS_TOKEN });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    const { userId, message, type, formUrl, title } = body;

    // ---- validate inputs ----
    if (!userId) return json(400, { success: false, message: 'userId is required' });
    if (!/^U[A-Za-z0-9]{20,}$/.test(userId)) {
      return json(400, { success: false, message: 'Invalid LINE user ID format' });
    }

    const client = createClient();

    let payload: Message | FlexMessage | null = null;

    if (type === 'card' && formUrl) {
      // ---- Flex Message (カード) ----
      payload = {
        type: 'flex',
        altText: title ?? 'Googleフォーム連携カード',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: title ?? 'Googleフォーム回答通知', weight: 'bold', size: 'md' },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: 'フォームを送信後、通知してください。',
                wrap: true,
                size: 'sm',
                color: '#555555',
              },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              // フォームを直接開くボタンを使いたければコメント解除
              // {
              //   type: 'button',
              //   style: 'primary',
              //   action: { type: 'uri', label: 'フォームを開く', uri: formUrl },
              // },
              {
                type: 'button',
                style: 'secondary',
                action: {
                  // これを押すとユーザー→公式LINEへ同文言が送信（webhook不要）
                  type: 'message',
                  label: '回答済を通知',
                  text: '申し込みフォーム回答済み',
                },
              },
            ],
          },
        },
      };
    } else {
      // ---- テキスト送信（後方互換）----
      if (!message) {
        return json(400, { success: false, message: 'message is required (for text type)' });
      }
      payload = { type: 'text', text: message };
    }

    await client.pushMessage(userId, payload);
    return json(200, { success: true });
  } catch (error: any) {
    console.error('❌ Failed to send LINE message', {
      err: String(error?.message ?? error),
      status: error?.statusCode ?? error?.status,
      response: error?.response?.data ?? null,
    });
    return json(500, { success: false, message: 'Failed to send message' });
  }
}

// 任意（疎通確認用）
export async function GET() {
  try {
    assertEnv();
    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message ?? 'env error' });
  }
}
