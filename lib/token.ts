import crypto from 'crypto';

type Payload = {
  uid: string;        // LINE userId
  lid: string;        // 連携リンクID（/api/links に保存済み）
  exp: number;        // 有効期限(unixtime 秒)
  nbf?: number;       // (任意) not-before
  // 将来拡張：aud, iss, jti など
};

const b64u = {
  enc: (buf: Buffer | string) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) =>
    Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
};

export function signToken(payload: Payload, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }; // 便宜上JWT風（実体は自前実装）
  const h = b64u.enc(JSON.stringify(header));
  const p = b64u.enc(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  const s = b64u.enc(sig);
  return `${data}.${s}`;
}

export function verifyToken(token: string, secret: string): Payload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('TOKEN_FORMAT');

  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest();
  const sig = b64u.dec(s);

  if (!crypto.timingSafeEqual(expected, sig)) throw new Error('TOKEN_SIGNATURE');

  const payload = JSON.parse(b64u.dec(p).toString('utf8')) as Payload;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('TOKEN_EXPIRED');
  if (typeof payload.nbf === 'number' && payload.nbf > now) throw new Error('TOKEN_NOT_BEFORE');

  if (!payload.uid || !payload.lid) throw new Error('TOKEN_CLAIMS');

  return payload;
}

export function makePayload(uid: string, lid: string, ttlSec: number): Payload {
  const now = Math.floor(Date.now() / 1000);
  return { uid, lid, exp: now + Math.max(1, ttlSec) };
}
