import { Client } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const client = new Client(config);

export interface LineMessageRequest {
  userId: string;
  message: string;
}

export async function sendLineMessage(request: LineMessageRequest): Promise<boolean> {
  try {
    console.log('🚀 Sending LINE message to user:', request.userId);
    
    await client.pushMessage(request.userId, {
      type: 'text',
      text: request.message,
    });
    
    console.log('✅ LINE message sent successfully to:', request.userId);
    return true;
  } catch (error) {
    console.error('❌ Failed to send LINE message:', error);
    return false;
  }
}