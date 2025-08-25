import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simplified LineUser type
interface LineUser {
  id: string;
  lineUserId: string;
  displayName: string;
  pictureUrl?: string | null;
  createdAt: Date;
}

// This would be shared storage in a real app
const lineUsers: Map<string, LineUser> = new Map();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { lineUserId } = req.query;
    
    if (typeof lineUserId === 'string') {
      const user = Array.from(lineUsers.values()).find(
        u => u.lineUserId === lineUserId
      );
      
      if (!user) {
        return res.status(404).json({ message: "LINE user not found" });
      }
      
      return res.status(200).json(user);
    }
    
    return res.status(400).json({ message: "lineUserId parameter required" });
  }

  return res.status(405).json({ message: "Method not allowed" });
}