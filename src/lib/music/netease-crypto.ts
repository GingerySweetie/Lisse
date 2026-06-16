/**
 * Weapi encryption — the request-payload scheme used by music.163.com's
 * web API. Per request:
 *
 *   1. Generate random 16-char ascii string  k
 *   2. AES-CBC encrypt(JSON(payload), key=PRESET_KEY, iv=IV) → b1
 *   3. AES-CBC encrypt(b1, key=k, iv=IV) → params  (base64)
 *   4. RSA encrypt(reverse(k), e=0x10001, n=RSA_PUB) → encSecKey (hex)
 *   5. POST application/x-www-form-urlencoded: params + encSecKey
 *
 * Server side: undoes 4 to recover k, then 3 → b1, then 2 → JSON.
 *
 * Native BigInt handles the modular exponentiation; no library needed.
 * AES uses Web Crypto (`crypto.subtle`).
 */

const PRESET_KEY = '0CoJUm6Qyw8W8jud';
const IV = '0102030405060708';
const RSA_PUB_KEY =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const RSA_EXP = '010001';

function randomString(len: number): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

async function aesEncrypt(text: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: enc.encode(IV) },
    cryptoKey,
    enc.encode(text),
  );
  return arrayBufferToBase64(ct);
}

function rsaEncrypt(text: string): string {
  // Per NetEase's bizarre convention: reverse the string first, then
  // treat as a big-endian byte sequence, then do textbook RSA (no padding).
  const reversed = text.split('').reverse().join('');
  const bytes = new TextEncoder().encode(reversed);
  const m = BigInt('0x' + bytesToHex(bytes));
  const e = BigInt('0x' + RSA_EXP);
  const n = BigInt('0x' + RSA_PUB_KEY);
  const c = modPow(m, e, n);
  let hex = c.toString(16);
  while (hex.length < 256) hex = '0' + hex;
  return hex;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export interface WeapiPayload {
  params: string;
  encSecKey: string;
}

/** Encrypt an API request payload using the weapi scheme. */
export async function weapi(payload: unknown): Promise<WeapiPayload> {
  const text = JSON.stringify(payload);
  const k = randomString(16);
  const b1 = await aesEncrypt(text, PRESET_KEY);
  const params = await aesEncrypt(b1, k);
  const encSecKey = rsaEncrypt(k);
  return { params, encSecKey };
}
