// client/api/forms/inspect.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const titleFromHtml = (html: string) =>
  html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.replace(/ - Google フォーム$/, '').trim()
  || html.match(/freebirdFormviewerViewHeaderTitle[^>]*>(.*?)<\/div>/)?.[1]?.trim();

const descFromHtml = (html: string) =>
  html.match(/<meta[^>]+itemprop=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim();

const entriesFromHtml = (html: string) => {
  const found = new Set<string>();
  const patterns = [
    /name="entry\.(\d+)"/g,
    /"entry\.(\d+)"/g,
    /'entry\.(\d+)'/g,
    /entry_(\d+)/g,
    /\[(\d{8,}),[^,]*?,null,.*?\[(\d{8,}),null,1\]/g,
  ];
  patterns.forEach((re, idx) => {
    for (const m of html.matchAll(re)) {
      const id = idx === patterns.length - 1 ? (m as RegExpMatchArray)[2] : (m as RegExpMatchArray)[1];
      if (id && id.length >= 8) found.add(`entry.${id}`);
    }
  });
  return Array.from(found);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const form = req.query.form as string;
  if (!form) return res.status(400).json({ success: false, error: 'Missing ?form=' });

  try {
    const r = await fetch(form, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await r.text();

    const title = titleFromHtml(html) || null;
    const description = descFromHtml(html) || null;
    const entries = entriesFromHtml(html);

    res.setHeader('Cache-Control', 's-maxage=300');
    res.json({ success: true, title, description, entries });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || 'fetch failed' });
  }
}
