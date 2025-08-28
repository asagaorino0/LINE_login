import { VercelRequest, VercelResponse } from '@vercel/node';
import { Client, FlexMessage } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { userId, message, type, formUrl, title } = req.body as {
      userId?: string;
      message?: string;
      type?: 'text' | 'card';
      formUrl?: string;
      title?: string;
    };

    if (!userId) return res.status(400).json({ message: 'userId is required' });
    if (!userId.startsWith('U') || userId.length < 30) {
      return res.status(400).json({ success: false, message: 'Invalid LINE user ID format' });
    }
    if (!config.channelAccessToken || !config.channelSecret) {
      console.error('❌ LINE API credentials not configured');
      return res.status(500).json({ success: false, message: 'LINE API credentials not configured' });
    }

    const client = new Client(config);

    // --- カード送信（Flex Message） ---
    if (type === 'card' && formUrl) {
      const flex: FlexMessage = {
        type: 'flex',
        altText: title ? `${title}（フォーム連携）` : 'フォーム連携カード',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: title || '申し込みフォーム', weight: 'bold', size: 'md' },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: 'LINE連携済みです。必要事項を入力後、送信してください。',
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
              {
                type: 'button',
                style: 'primary',
                action: {
                  type: 'uri',
                  label: 'フォームを開く',
                  uri: formUrl,
                },
              },
              {
                type: 'button',
                style: 'secondary',
                action: {
                  // ★ これを押すとユーザーから公式LINEへ同文言が送信されます（webhook不要）
                  type: 'message',
                  label: '回答済み',
                  text: '申し込みフォーム回答済み',
                },
              },
            ],
          },
        },
      };

      await client.pushMessage(userId, flex);
      return res.json({ success: true });
    }

    // --- テキスト（後方互換） ---
    if (!message) return res.status(400).json({ message: 'message is required (for text type)' });

    await client.pushMessage(userId, { type: 'text', text: message });
    return res.json({ success: true });

  } catch (error: any) {
    console.error('❌ Failed to send LINE message:', error, {
      message: error?.message,
      status: error?.statusCode || error?.status,
      response: error?.response?.data || 'No response data',
    });
    return res.status(500).json({ success: false, message: 'Failed to send message' });
  }
}
