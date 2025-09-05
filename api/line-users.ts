// api/line-users.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

function withSig(
  data: any,
  status: number = 200,
  extraHeaders: Record<string, string> = {}
) {
  return {
    body: {
      ...data,
      _source: 'vercel-fn:api/line-users.ts',
      _ts: new Date().toISOString(),
    },
    status,
    headers: {
      'x-source': 'vercel-fn:api/line-users.ts',
      'x-source-ts': Date.now().toString(),
      ...extraHeaders,
    },
  };
}

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

// 超簡易ストア（本番はDB推奨）
const lineUsers: Map<string, LineUser> = new Map();

function generateId(): string {
  return 'usr_' + Math.random().toString(36).substring(2, 15);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS
  if (req.method === 'OPTIONS') {
    const p = withSig({ ok: true, code: 'OPTIONS_OK' }, 200);
    Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(p.status).json(p.body);
  }

  // POST /api/line-users
  if (req.method === 'POST') {
    try {
      const validatedData = insertLineUserSchema.parse(req.body);

      // 既存チェック
      const existing = Array.from(lineUsers.values()).find(
        u => u.lineUserId === validatedData.lineUserId
      );

      let result: LineUser;
      if (existing) {
        result = {
          ...existing,
          displayName: validatedData.displayName,
          pictureUrl: validatedData.pictureUrl ?? null,
        };
        lineUsers.set(existing.id, result);
        const p = withSig(result, 200);
        Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(p.status).json(p.body);
      }

      // 新規
      result = {
        id: generateId(),
        lineUserId: validatedData.lineUserId,
        displayName: validatedData.displayName,
        pictureUrl: validatedData.pictureUrl ?? null,
        createdAt: new Date(),
      };
      lineUsers.set(result.id, result);
      const p = withSig(result, 201);
      Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(p.status).json(p.body);

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const p = withSig(
          {
            message: 'Invalid user data eeeee',
            errors: error.errors,
            dbg: {
              method: req.method,
              url: req.url,
              ctype: req.headers['content-type'] || null,
              bodyType: typeof req.body,
              keys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : null,
            },
          },
          400
        );
        Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(p.status).json(p.body);
      }
      const p = withSig({ message: 'Failed to create/update LINE user' }, 500);
      Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(p.status).json(p.body);
    }
  }

  // GET /api/line-users?lineUserId=...
  if (req.method === 'GET') {
    const { lineUserId } = req.query;
    if (typeof lineUserId === 'string') {
      const user = Array.from(lineUsers.values()).find(u => u.lineUserId === lineUserId);
      if (!user) {
        const p = withSig({ message: 'LINE user not found' }, 404);
        Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(p.status).json(p.body);
      }
      const p = withSig(user, 200);
      Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(p.status).json(p.body);
    }
    const p = withSig({ message: 'lineUserId parameter required' }, 400);
    Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(p.status).json(p.body);
  }

  // 405
  const p = withSig({ message: 'Method not allowed' }, 405);
  Object.entries(p.headers).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(p.status).json(p.body);
}
