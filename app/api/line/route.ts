// app/api/line/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { Client, type FlexMessage } from '@line/bot-sdk';

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  } as const;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const { userId, message, type, formUrl, title } = (await req.json()) as {
      userId?: string;
      message?: string;
      type?: 'text' | 'card';
      formUrl?: string;
      title?: string;
    };

    if (!userId) return NextResponse.json({ message: 'userId is required' }, { status: 400, headers });
    if (!/^U[0-9a-f]{32,}$/i.test(userId)) {
      return NextResponse.json({ success: false, message: 'Invalid LINE user ID format' }, { status: 400, headers });
    }

    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
    const channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';
    if (!channelAccessToken || !channelSecret) {
      console.error('❌ LINE API credentials not configured');
      return NextResponse.json({ success: false, message: 'LINE API credentials not configured' }, { status: 500, headers });
    }

    const client = new Client({ channelAccessToken, channelSecret });

    if (type === 'card' && formUrl) {
      const flex: FlexMessage = {
        type: 'flex',
        altText: title ?? 'Googleフォーム連携カード',
        contents: {
          type: 'bubble',
          header: {
            type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: title ?? 'Googleフォーム回答通知', weight: 'bold', size: 'md' },
            ]
          },
          body: {
            type: 'box', layout: 'vertical', spacing: 'sm', contents: [
              { type: 'text', text: 'フォームを送信後、通知してください。', wrap: true, size: 'sm', color: '#555555' },
            ]
          },
          footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', contents: [
              // { type: 'button', style: 'primary', action: { type: 'uri', label: 'フォームを開く', uri: formUrl } },
              {
                type: 'button', style: 'secondary',
                action: { type: 'message', label: '回答済を通知', text: '申し込みフォーム回答済み' }
              },
            ]
          },
        },
      };
      await client.pushMessage(userId, flex);
      return NextResponse.json({ success: true }, { headers });
    }

    if (!message) {
      return NextResponse.json({ message: 'message is required (for text type)' }, { status: 400, headers });
    }

    await client.pushMessage(userId, { type: 'text', text: message });
    return NextResponse.json({ success: true }, { headers });
  } catch (error: any) {
    console.error('❌ Failed to send LINE message:', {
      message: error?.message,
      status: error?.statusCode || error?.status,
      response: error?.response?.data || 'No response data',
      error,
    });
    return NextResponse.json({ success: false, message: 'Failed to send message' }, { status: 500, headers });
  }
}
