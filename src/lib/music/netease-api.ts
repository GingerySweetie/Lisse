import { CapacitorCookies, CapacitorHttp, type HttpHeaders } from '@capacitor/core';
import { weapi } from './netease-crypto';

/**
 * NetEase Cloud Music HTTP client. All requests go through CapacitorHttp
 * so they hit the native HTTP stack (Android OkHttp) — bypasses WebView
 * CORS + carries cookies automatically via the system cookie store.
 *
 * Endpoints are weapi-encrypted. The server expects:
 *   POST <api>?csrf_token=
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: params=<base64>&encSecKey=<hex>
 */

const BASE = 'https://music.163.com';

const COMMON_HEADERS: HttpHeaders = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Referer: 'https://music.163.com',
  Origin: 'https://music.163.com',
  // NetEase rejects "obvious browser" UAs from non-music.163.com origins;
  // pretend to be the iOS app.
  'User-Agent':
    'NeteaseMusic/9.0.65.240522182511(9000065);Dalvik/2.1.0 (Linux; U; Android 14)',
};

async function post(path: string, payload: object): Promise<unknown> {
  const enc = await weapi(payload);
  const body =
    'params=' + encodeURIComponent(enc.params) +
    '&encSecKey=' + encodeURIComponent(enc.encSecKey);
  const res = await CapacitorHttp.post({
    url: `${BASE}${path}?csrf_token=`,
    headers: COMMON_HEADERS,
    data: body,
  });
  if (res.status >= 400) {
    throw new Error(`NetEase ${path} HTTP ${res.status}`);
  }
  // CapacitorHttp auto-parses JSON when content-type is JSON.
  return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
}

/* ─── Search ────────────────────────────────────────────────────────── */

export interface SongArtist {
  id: number;
  name: string;
}
export interface SongAlbum {
  id: number;
  name: string;
  /** Cover image URL, often https. May be undefined. */
  picUrl?: string;
}
export interface Song {
  id: number;
  name: string;
  artists: SongArtist[];
  album: SongAlbum;
  /** Duration in ms. */
  durationMs: number;
  /** Some flag indicating VIP-only / Free. fee 0|8 = free, 1 = vip, 4 = album-only. */
  fee: number;
}

export async function search(keyword: string): Promise<Song[]> {
  const data = (await post('/weapi/cloudsearch/get/web', {
    s: keyword,
    type: 1,        // 1 = song
    limit: 30,
    offset: 0,
    total: true,
  })) as {
    result?: {
      songs?: Array<{
        id: number;
        name: string;
        ar: Array<{ id: number; name: string }>;
        al: { id: number; name: string; picUrl?: string };
        dt: number;
        fee?: number;
      }>;
    };
  };
  const songs = data.result?.songs ?? [];
  return songs.map((s) => ({
    id: s.id,
    name: s.name,
    artists: s.ar.map((a) => ({ id: a.id, name: a.name })),
    album: { id: s.al.id, name: s.al.name, picUrl: s.al.picUrl },
    durationMs: s.dt,
    fee: s.fee ?? 0,
  }));
}

/* ─── Stream URL ────────────────────────────────────────────────────── */

export interface SongStream {
  url: string | null;
  /** Bitrate (e.g. 320000). */
  br: number;
  /** "free", "trial", "subscription". */
  level: string;
  /** Server-returned expiration epoch ms (approximate; we just refetch on
   *  playback failure). */
  expi?: number;
}

export async function getSongUrl(songId: number): Promise<SongStream | null> {
  const data = (await post('/weapi/song/enhance/player/url/v1', {
    ids: [songId],
    level: 'exhigh',
    encodeType: 'mp3',
  })) as { data?: Array<{
    id: number; url: string | null; br: number; level: string; expi?: number;
  }> };
  const item = data.data?.[0];
  if (!item) return null;
  return {
    url: item.url,
    br: item.br ?? 0,
    level: item.level ?? '',
    expi: item.expi,
  };
}

/* ─── Lyrics ────────────────────────────────────────────────────────── */

export interface SongLyric {
  /** Raw LRC text (synchronized timestamps). */
  lrc: string;
  /** Translation LRC if available. */
  tlyric?: string;
}

export async function getLyric(songId: number): Promise<SongLyric | null> {
  const data = (await post('/weapi/song/lyric', {
    id: songId,
    lv: -1,
    tv: -1,
    csrf_token: '',
  })) as { lrc?: { lyric?: string }; tlyric?: { lyric?: string } };
  if (!data.lrc?.lyric) return null;
  return {
    lrc: data.lrc.lyric,
    tlyric: data.tlyric?.lyric || undefined,
  };
}

/* ─── QR code login ─────────────────────────────────────────────────── */

export interface QrUnikey {
  unikey: string;
  /** Build the QR-encoded URL from this. */
  url: string;
}

export async function loginQrKey(): Promise<QrUnikey> {
  const data = (await post('/weapi/login/qrcode/unikey', { type: 1 })) as {
    code: number; unikey: string;
  };
  if (data.code !== 200) throw new Error('QR unikey failed');
  return {
    unikey: data.unikey,
    url: `https://music.163.com/login?codekey=${data.unikey}`,
  };
}

export type QrStatus = 'pending' | 'scanned' | 'success' | 'expired';

export async function loginQrCheck(unikey: string): Promise<{
  status: QrStatus;
  nickname?: string;
  avatarUrl?: string;
}> {
  const data = (await post('/weapi/login/qrcode/client/login', {
    type: 1, key: unikey,
  })) as {
    code: number; message?: string;
    nickname?: string; avatarUrl?: string;
  };
  // 800 expired, 801 waiting scan, 802 scanned waiting confirm, 803 success
  const map: Record<number, QrStatus> = {
    800: 'expired',
    801: 'pending',
    802: 'scanned',
    803: 'success',
  };
  return {
    status: map[data.code] ?? 'pending',
    nickname: data.nickname,
    avatarUrl: data.avatarUrl,
  };
}

/* ─── User account (post-login) ─────────────────────────────────────── */

export interface UserAccount {
  userId: number;
  nickname: string;
  avatarUrl?: string;
  /** vipType > 0 means VIP. */
  vipType: number;
}

export async function getLoginStatus(): Promise<UserAccount | null> {
  // GET-style endpoint but still weapi.
  const data = (await post('/weapi/w/nuser/account/get', {})) as {
    code: number;
    account?: { id: number; vipType: number };
    profile?: { nickname: string; avatarUrl?: string };
  };
  if (!data.account || data.code !== 200) return null;
  return {
    userId: data.account.id,
    nickname: data.profile?.nickname ?? '',
    avatarUrl: data.profile?.avatarUrl,
    vipType: data.account.vipType ?? 0,
  };
}

/* ─── Cookie-import login (绕开 QR 风控) ────────────────────────────── */

/**
 * 把 MUSIC_U 直接塞进系统 cookie jar, 跳过 QR 扫码全过程. 用户去
 * 浏览器登 music.163.com → F12 → Application → Cookies → 复制
 * MUSIC_U 的值粘进来. 之后 CapacitorHttp 自动带 cookie, 等同登录态.
 *
 * NetEase 在 2024+ 把第三方 QR 接入的风控收得很紧 (我们看到的
 * "安全风险提醒 22Qd2gX/178..." 就是这套). 直接拿用户已有的
 * cookie 不触发任何 auth 流程, 风控也就没东西可拦.
 */
export async function loginByCookie(musicU: string): Promise<UserAccount | null> {
  const u = musicU.trim();
  if (!u) throw new Error('MUSIC_U 不能为空');
  // music.163.com 自己的二级域名 + 主域名都要写一份, 不同 endpoint
  // 用不同 subdomain.
  for (const url of [
    'https://music.163.com',
    'https://interface.music.163.com',
    'https://interface3.music.163.com',
  ]) {
    try {
      await CapacitorCookies.setCookie({
        url,
        key: 'MUSIC_U',
        value: u,
      });
    } catch {
      // 单个 set 失败不致命, 继续
    }
  }
  return getLoginStatus();
}

/** 清掉 cookie jar 里 music.163.com 的所有 cookie — 退出登录用. */
export async function logout(): Promise<void> {
  for (const url of [
    'https://music.163.com',
    'https://interface.music.163.com',
    'https://interface3.music.163.com',
  ]) {
    try {
      await CapacitorCookies.clearCookies({ url });
    } catch {
      // ignore
    }
  }
}
