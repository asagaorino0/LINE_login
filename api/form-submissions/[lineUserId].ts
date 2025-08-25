import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simplified FormSubmission type
interface FormSubmission {
  id: string;
  lineUserId: string;
  formUrl: string;
  additionalMessage?: string | null;
  submittedAt: Date;
  success: boolean;
}

// This would be shared storage in a real app
const formSubmissions: Map<string, FormSubmission> = new Map();

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
      const userSubmissions = Array.from(formSubmissions.values()).filter(
        submission => submission.lineUserId === lineUserId
      );
      
      return res.status(200).json(userSubmissions);
    }
    
    return res.status(400).json({ message: "lineUserId parameter required" });
  }

  return res.status(405).json({ message: "Method not allowed" });
}