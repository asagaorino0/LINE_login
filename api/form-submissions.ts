import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

// Simplified types for API-only deployment
interface FormSubmission {
  id: string;
  lineUserId: string;
  formUrl: string;
  additionalMessage?: string | null;
  submittedAt: Date;
  success: boolean;
}

const insertFormSubmissionSchema = z.object({
  lineUserId: z.string(),
  formUrl: z.string(),
  additionalMessage: z.string().optional(),
});

// In-memory storage for simplicity (consider database for production)
const formSubmissions: Map<string, FormSubmission> = new Map();

function generateId(): string {
  return 'sub_' + Math.random().toString(36).substring(2, 15);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const validatedData = insertFormSubmissionSchema.parse(req.body);
      
      const submission: FormSubmission = {
        id: generateId(),
        lineUserId: validatedData.lineUserId,
        formUrl: validatedData.formUrl,
        additionalMessage: validatedData.additionalMessage || null,
        submittedAt: new Date(),
        success: true,
      };
      
      formSubmissions.set(submission.id, submission);
      return res.status(201).json(submission);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid submission data", errors: error.errors });
      }
      return res.status(500).json({ message: "Failed to create form submission" });
    }
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