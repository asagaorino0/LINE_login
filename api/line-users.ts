import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

// Simplified types for API-only deployment
interface LineUser {
  id: string;
  lineUserId: string;
  displayName: string;
  pictureUrl?: string | null;
  createdAt: Date;
}

const insertLineUserSchema = z.object({
  lineUserId: z.string(),
  displayName: z.string(),
  pictureUrl: z.string().optional(),
});

// In-memory storage for simplicity (consider database for production)
const lineUsers: Map<string, LineUser> = new Map();

function generateId(): string {
  return 'usr_' + Math.random().toString(36).substring(2, 15);
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
      const validatedData = insertLineUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = Array.from(lineUsers.values()).find(
        user => user.lineUserId === validatedData.lineUserId
      );
      
      if (existingUser) {
        // Update existing user
        const updatedUser: LineUser = {
          ...existingUser,
          displayName: validatedData.displayName,
          pictureUrl: validatedData.pictureUrl || null,
        };
        lineUsers.set(existingUser.id, updatedUser);
        return res.status(200).json(updatedUser);
      }
      
      // Create new user
      const newUser: LineUser = {
        id: generateId(),
        lineUserId: validatedData.lineUserId,
        displayName: validatedData.displayName,
        pictureUrl: validatedData.pictureUrl || null,
        createdAt: new Date(),
      };
      
      lineUsers.set(newUser.id, newUser);
      return res.status(201).json(newUser);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      return res.status(500).json({ message: "Failed to create/update LINE user" });
    }
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