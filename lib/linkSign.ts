// lib/linkSign.ts
import crypto from "crypto";

const SECRET = process.env.LINK_SIGN_SECRET || "";
if (!SECRET) console.warn("[linkSign] LINK_SIGN_SECRET is not set");

/** 署名を作成（HMAC-SHA256, Base64URL） */
export function sign(aid: string, formId: string, exp: number) {
  const data = `${aid}.${formId}.${exp}`;
  // ← ここを base64url に統一（hex にしたいなら両方 hex に揃える）
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

/** 署名を検証（有効期限もチェック） */
export function verify(aid?: string, formId?: string, exp?: number, sig?: string) {
  if (!aid || !formId || !exp || !sig || !SECRET) return false;
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) return false; // 期限切れ
  const expected = sign(aid, formId, exp);
  // 長さ合わせて timing-safe 比較
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}






