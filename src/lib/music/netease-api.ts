import { CapacitorCookies, CapacitorHttp, type HttpHeaders } from '@capacitor/core';
import InAppBrowser from '../native/in-app-browser';
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

/** NetEase 服务返回的图片 / 流 URL 经常是 http://, 我们 WebView
 *  跑在 https 上 + 国产 OEM ROM 的 mixed-content 处理不一致, 一律
 *  强制 https. 站点都接受 https 不会断. */
function forceHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://')) return 'https://' + url.slice(7);
  return url;
}

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
    album: {
      id: s.al.id,
      name: s.al.name,
      picUrl: forceHttps(s.al.picUrl) ?? undefined,
    },
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
    url: forceHttps(item.url),
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

/**
 * 从内置浏览器同步登录态. Android 的 CookieManager 是全局单例,
 * 用户在 InAppBrowserActivity 里登过 music.163.com → 同一份
 * cookie jar 里就有 MUSIC_U. 我们 getCookies 拿出来, 调
 * loginByCookie 验证 + 落进 db.musicCredentials.
 *
 * 用法: 用户在 Wisteria 内置浏览器里桌面模式打开 music.163.com
 * 登完, 切回音乐页, 点「从内置浏览器同步登录」就接管登录态,
 * 不用手撸 cookie 复制粘贴.
 */
export async function loginByBrowserCookie(): Promise<UserAccount | null> {
  // 两条路径都试一下:
  //   1. InAppBrowser.getCookies — 直通 android.webkit.CookieManager
  //      .getInstance(), 内置浏览器 Activity 写的 jar 一定看得见
  //   2. CapacitorCookies.getCookies — 通常也是同一份, 但部分 OEM
  //      WebView 上跟 1 不是同一份, 备份兜底
  //
  // 之前只走 2, 用户反馈"登了但读不到 MUSIC_U" 就是这条路径在那
  // 些设备上看不到内置浏览器 Activity 的 jar 导致的.
  const urls = [
    'https://music.163.com',
    'https://interface.music.163.com',
    'https://interface3.music.163.com',
  ];
  let musicU: string | null = null;
  // 收集所有找到的 cookie name, 给错误文案用 — 用户看到「找到了
  // 这些 cookie 但没 MUSIC_U」就知道是不是 NetEase 换了 cookie 名 /
  // 还没登成功
  const foundKeys = new Set<string>();

  outer: for (const url of urls) {
    // path 1: 我们自己的 InAppBrowser.getCookies
    try {
      const r = await InAppBrowser.getCookies({ url });
      for (const k of Object.keys(r.cookies)) foundKeys.add(k);
      if (typeof r.cookies.MUSIC_U === 'string' && r.cookies.MUSIC_U) {
        musicU = r.cookies.MUSIC_U;
        break outer;
      }
    } catch {
      // ignore, 试 path 2
    }
    // path 2: CapacitorCookies fallback
    try {
      const cookies = (await CapacitorCookies.getCookies({ url })) as Record<
        string,
        string
      >;
      for (const k of Object.keys(cookies)) foundKeys.add(k);
      if (typeof cookies.MUSIC_U === 'string' && cookies.MUSIC_U) {
        musicU = cookies.MUSIC_U;
        break outer;
      }
    } catch {
      // ignore
    }
  }

  if (!musicU) {
    const found =
      foundKeys.size > 0
        ? ` 当前 jar 里有: ${Array.from(foundKeys).join(', ').slice(0, 200)}.`
        : ' (cookie jar 是空的, 内置浏览器可能还没登过.)';
    throw new Error(
      '没拿到 MUSIC_U.' +
        found +
        ' 先在内置浏览器里切桌面模式 → 登 music.163.com → 等几秒让 cookie 落地 → 再回来同步.',
    );
  }
  return loginByCookie(musicU);
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

/* ─── User playlists (logged-in only) ───────────────────────────────── */

export interface UserPlaylist {
  id: number;
  name: string;
  /** 封面图. */
  picUrl?: string;
  /** 歌曲数. */
  trackCount: number;
  /** "我喜欢的音乐" / 创建的 / 收藏的 — UI 自己分类. */
  creatorId: number;
  /** 是不是用户自己创建的 (vs 收藏别人的). */
  ownedByMe: boolean;
}

export async function getUserPlaylists(
  userId: number,
  limit = 50,
): Promise<UserPlaylist[]> {
  const data = (await post('/weapi/user/playlist', {
    uid: userId,
    limit,
    offset: 0,
    includeVideo: false,
  })) as {
    code: number;
    playlist?: Array<{
      id: number;
      name: string;
      coverImgUrl?: string;
      trackCount: number;
      userId: number;
      creator?: { userId: number };
    }>;
  };
  const list = data.playlist ?? [];
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    picUrl: forceHttps(p.coverImgUrl) ?? undefined,
    trackCount: p.trackCount,
    creatorId: p.creator?.userId ?? p.userId,
    ownedByMe: (p.creator?.userId ?? p.userId) === userId,
  }));
}

/* ─── Playlist tracks ────────────────────────────────────────────── */

/** 一个 playlist 的曲目列表. 默认拉全量 trackIds 然后用
 *  getSongsByIds 补全 — playlist/detail 自带的 tracks 字段在 > 1000
 *  首时会被截断, 走 trackIds + song/detail 才能拿全。 */
export async function getPlaylistTracks(playlistId: number): Promise<Song[]> {
  // step 1: 拿 trackIds
  const meta = (await post('/weapi/v6/playlist/detail', {
    id: playlistId,
    n: 100000,
    csrf_token: '',
  })) as {
    code: number;
    playlist?: {
      trackIds?: Array<{ id: number }>;
      tracks?: unknown[];
    };
  };
  const ids = meta.playlist?.trackIds?.map((x) => x.id) ?? [];
  if (ids.length === 0) return [];
  // NetEase song/detail 一次最多 1000 个 id, 分批查
  const out: Song[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const songs = await getSongsByIds(chunk);
    out.push(...songs);
  }
  return out;
}

export async function getSongsByIds(ids: number[]): Promise<Song[]> {
  if (ids.length === 0) return [];
  const data = (await post('/weapi/v3/song/detail', {
    c: JSON.stringify(ids.map((id) => ({ id }))),
  })) as {
    code: number;
    songs?: Array<{
      id: number;
      name: string;
      ar: Array<{ id: number; name: string }>;
      al: { id: number; name: string; picUrl?: string };
      dt: number;
      fee?: number;
    }>;
  };
  const songs = data.songs ?? [];
  return songs.map((s) => ({
    id: s.id,
    name: s.name,
    artists: s.ar.map((a) => ({ id: a.id, name: a.name })),
    album: {
      id: s.al.id,
      name: s.al.name,
      picUrl: forceHttps(s.al.picUrl) ?? undefined,
    },
    durationMs: s.dt,
    fee: s.fee ?? 0,
  }));
}
