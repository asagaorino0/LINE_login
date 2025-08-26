import { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ message: 'userId and message are required' });
    }

    // Validate LINE credentials
    if (!config.channelAccessToken || !config.channelSecret) {
      console.error('❌ LINE API credentials not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'LINE API credentials not configured' 
      });
    }

    // Validate that this looks like a LINE user ID
    if (!userId.startsWith('U') || userId.length < 30) {
      console.error('❌ Invalid LINE user ID format:', userId);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid LINE user ID format' 
      });
    }

    console.log('🚀 Sending LINE message to user:', userId);
    console.log('📝 Message content:', message);
    console.log('🔑 Channel access token exists:', !!config.channelAccessToken);
    console.log('🔑 Channel secret exists:', !!config.channelSecret);

    const client = new Client(config);
    
    await client.pushMessage(userId, {
      type: 'text',
      text: message,
    });
    
    console.log('✅ LINE message sent successfully to:', userId);
    
    res.json({ success: true, message: 'Message sent successfully' });
    
  } catch (error) {
    console.error('❌ Failed to send LINE message:', error);
    
    // Log more details about the error
    if (error && typeof error === 'object') {
      console.error('❌ Error details:', {
        message: (error as any).message,
        status: (error as any).statusCode || (error as any).status,
        response: (error as any).response?.data || 'No response data'
      });
    }
    
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
}