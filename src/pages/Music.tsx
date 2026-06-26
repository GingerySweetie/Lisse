import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Pause,
  Play,
  Search,
  SkipForward,
  SkipBack,
  User,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { db } from '../db';
import { newId } from '../lib/id';
import {
  search as searchApi,
  getSongUrl,
  getLyric,
  loginByBrowserCookie,
  loginByCookie,
  loginQrKey,
  loginQrCheck,
  getLoginStatus,
  getUserPlaylists,
  getPlaylistTracks,
  type Song,
  type UserPlaylist,
} from '../lib/music/netease-api';
import { activeLineIndex, parseLrc, type LrcLine } from '../lib/music/lrc';

/**
 * Music player — NetEase Cloud Music client implemented entirely in
 * Wisteria (no self-hosted backend). Search + play + lyrics + QR login
 * for VIP tracks. Audio playback uses HTMLAudioElement so the system
 * media session works out of the box.
 *
 * Phase 1 scope: single-track playback (no queue yet). Phase 2 will
 * add playlists / queue / 心动模式 / liked-songs sync.
 */

interface QueueItem {
  song: Song;
}

/** 旧的 db.musicHistory 行可能存的还是 http:// 的封面 URL — 网易云
 *  CDN 早期那一批. Capacitor WebView 跑在 https origin 上, 大部分
 *  ROM 不让混合内容图片加载, 显示成裂图. 走前一律强转 https. */
function httpsify(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://')) return 'https://' + url.slice(7);
  return url;
}

export default function MusicPage() {
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Song[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [current, setCurrent] = useState<QueueItem | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [lrc, setLrc] = useState<LrcLine[]>([]);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  // 用户的网易云歌单, 登录后拉. 选中其中一个 → 展开看 tracks.
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<UserPlaylist | null>(
    null,
  );
  const [playlistTracks, setPlaylistTracks] = useState<Song[]>([]);
  const [playlistTracksLoading, setPlaylistTracksLoading] = useState(false);

  const creds = useLiveQuery(
    () => db.musicCredentials.get('netease'),
    [],
    undefined,
  );

  // 登录后拉歌单列表; 登出清空.
  useEffect(() => {
    if (!creds) {
      setPlaylists([]);
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
      return;
    }
    let cancelled = false;
    setPlaylistsLoading(true);
    (async () => {
      try {
        const lists = await getUserPlaylists(creds.userId);
        if (!cancelled) setPlaylists(lists);
      } catch (e) {
        if (!cancelled) {
          console.warn('getUserPlaylists failed:', e);
        }
      } finally {
        if (!cancelled) setPlaylistsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creds]);

  // 选中歌单 → 拉它的曲目.
  useEffect(() => {
    if (!selectedPlaylist) {
      setPlaylistTracks([]);
      return;
    }
    let cancelled = false;
    setPlaylistTracksLoading(true);
    setPlaylistTracks([]);
    (async () => {
      try {
        const tracks = await getPlaylistTracks(selectedPlaylist.id);
        if (!cancelled) setPlaylistTracks(tracks);
      } catch (e) {
        if (!cancelled) {
          setError(
            '加载歌单失败: ' + (e instanceof Error ? e.message : String(e)),
          );
        }
      } finally {
        if (!cancelled) setPlaylistTracksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPlaylist]);

  // AI 在聊天里用 play_song 工具时, tool 把请求写到 db.kv.
  // 音乐页一 mount / 一拿到新请求就消费并清掉 — 跨页面的 "AI 让
  // 我放" 桥. 用 ref 记 lastRequestedAt 防止 useLiveQuery 在同次
  // 请求上回放两次.
  const lastRequestedAt = useRef<number>(0);
  const pendingPlay = useLiveQuery(
    () => db.kv.get('music_pending_play'),
    [],
    undefined,
  );
  useEffect(() => {
    if (!pendingPlay?.value) return;
    const req = pendingPlay.value as {
      songId: number;
      name: string;
      artist: string;
      album: string;
      picUrl?: string;
      requestedAt: number;
    };
    if (!req.requestedAt || req.requestedAt <= lastRequestedAt.current) return;
    lastRequestedAt.current = req.requestedAt;
    setCurrent({
      song: {
        id: req.songId,
        name: req.name,
        artists: [{ id: 0, name: req.artist }],
        album: { id: 0, name: req.album, picUrl: req.picUrl },
        durationMs: 0,
        fee: 0,
      },
    });
    // 消费完清掉, 避免下次进页面再触发
    void db.kv.delete('music_pending_play');
  }, [pendingPlay]);

  // Submit search
  async function runSearch(text: string) {
    const q = text.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const r = await searchApi(q);
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  // When a song is selected, fetch URL + lyrics + record history.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setStreamUrl(null);
    setLrc([]);
    setError(null);
    (async () => {
      try {
        const [stream, lyric] = await Promise.all([
          getSongUrl(current.song.id),
          getLyric(current.song.id),
        ]);
        if (cancelled) return;
        if (!stream?.url) {
          // 区分一下: fee=1 是 VIP, fee=4 是专辑付费, 其他通常是版权
          // / 地区限制. 没登录 + VIP 提示登录, 已登录但是 VIP / 专辑
          // 付费提示要会员.
          let msg = '拿不到这首歌的播放地址';
          if (current.song.fee === 1) {
            msg = creds
              ? 'VIP 歌曲, 当前账号不是 VIP 会员, 没法解析'
              : 'VIP 歌曲, 先登录网易云账号';
          } else if (current.song.fee === 4) {
            msg = '专辑付费歌曲, 网易云这边没卖给我们解析权';
          } else {
            msg = '没拿到播放地址 (可能下架 / 区域限制 / 版权问题)';
          }
          setError(msg);
          return;
        }
        setStreamUrl(stream.url);
        if (lyric) setLrc(parseLrc(lyric.lrc));
        await db.musicHistory.put({
          id: newId(),
          songId: current.song.id,
          name: current.song.name,
          artist: current.song.artists.map((a) => a.name).join(' / '),
          album: current.song.album.name,
          picUrl: current.song.album.picUrl,
          playedAt: Date.now(),
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current, creds]);

  // Drive HTMLAudioElement.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (streamUrl) {
      audio.src = streamUrl;
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.removeAttribute('src');
      audio.load();
      setPlaying(false);
    }
  }, [streamUrl]);

  const activeLrcIdx = useMemo(
    () => activeLineIndex(lrc, positionMs),
    [lrc, positionMs],
  );

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/home"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50"
        >
          <ChevronLeft size={16} />
          玄関
        </Link>
        <h2 className="endpoint-card-title">音乐</h2>
        <button
          type="button"
          onClick={() => setLoginOpen(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-lavender-200 px-2.5 py-1 text-xs text-ink-700 hover:bg-lavender-50"
        >
          <User size={12} />
          {creds ? (creds.nickname ?? '已登录') : '登录'}
          {creds?.vipType && creds.vipType > 0 ? (
            <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">
              VIP
            </span>
          ) : null}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <SearchBar
            value={keyword}
            onChange={setKeyword}
            onSubmit={() => void runSearch(keyword)}
            busy={searching}
          />

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded-full p-0.5 text-rose-500/70 hover:bg-rose-100"
                aria-label="关闭"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {selectedPlaylist ? (
            <PlaylistDetail
              playlist={selectedPlaylist}
              tracks={playlistTracks}
              loading={playlistTracksLoading}
              currentId={current?.song.id ?? null}
              playing={playing}
              onBack={() => setSelectedPlaylist(null)}
              onPlay={(s) => setCurrent({ song: s })}
            />
          ) : results.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {results.map((s) => (
                <li key={s.id}>
                  <SongRow
                    song={s}
                    playing={current?.song.id === s.id && playing}
                    onPlay={() => setCurrent({ song: s })}
                  />
                </li>
              ))}
            </ul>
          ) : !searching ? (
            <>
              {creds && (
                <UserPlaylists
                  playlists={playlists}
                  loading={playlistsLoading}
                  myUserId={creds.userId}
                  onPick={(p) => setSelectedPlaylist(p)}
                />
              )}
              <RecentlyPlayed onPlay={(s) => setCurrent({ song: s })} />
            </>
          ) : null}
        </div>
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPositionMs(e.currentTarget.currentTime * 1000)}
        onLoadedMetadata={(e) =>
          setDurationMs(e.currentTarget.duration * 1000)
        }
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={(e) => {
          // MediaError code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED — 几乎都
          // 是 mixed-content (http stream 被 https WebView 拦) 或
          // ROM 不支持 mp3 容器. 之前提示「The element has no
          // supported sources」就是这条, 完全没救场指引 — 现在告诉
          // 用户具体什么糊掉了.
          const me = e.currentTarget.error;
          const codes: Record<number, string> = {
            1: '播放被中止',
            2: '网络错误, 拉流失败',
            3: '解码失败 (格式不支持)',
            4: '流格式不支持 / 加载失败 (大概率混合内容拦截)',
          };
          const msg = me ? codes[me.code] ?? `MediaError ${me.code}` : '播放出错';
          setError(`${msg}${streamUrl ? ' — ' + streamUrl.slice(0, 60) + '…' : ''}`);
          setPlaying(false);
        }}
      />

      {current && (
        <>
          <MiniPlayer
            song={current.song}
            playing={playing}
            onToggle={() => {
              const a = audioRef.current;
              if (!a) return;
              if (playing) a.pause();
              else void a.play();
            }}
            onExpand={() => setExpanded(true)}
            positionMs={positionMs}
            durationMs={durationMs}
          />
          {expanded && (
            <FullPlayer
              song={current.song}
              playing={playing}
              positionMs={positionMs}
              durationMs={durationMs}
              lrc={lrc}
              activeLine={activeLrcIdx}
              onClose={() => setExpanded(false)}
              onToggle={() => {
                const a = audioRef.current;
                if (!a) return;
                if (playing) a.pause();
                else void a.play();
              }}
              onSeek={(ms) => {
                const a = audioRef.current;
                if (!a) return;
                a.currentTime = ms / 1000;
              }}
            />
          )}
        </>
      )}

      {loginOpen && (
        <LoginSheet
          onClose={() => setLoginOpen(false)}
          onSuccess={async () => {
            const acct = await getLoginStatus();
            if (acct) {
              await db.musicCredentials.put({
                id: 'netease',
                userId: acct.userId,
                nickname: acct.nickname,
                avatarUrl: acct.avatarUrl,
                vipType: acct.vipType,
                savedAt: Date.now(),
              });
            }
            setLoginOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-lavender-200 bg-white px-4 py-2">
      <Search size={14} className="text-ink-500" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
        placeholder="搜歌 / 歌手 / 专辑"
        className="flex-1 bg-transparent text-sm text-ink-900 focus:outline-none"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="rounded-full bg-lavender-200 px-3 py-1 text-xs text-ink-900 hover:bg-lavender-300 disabled:opacity-50"
      >
        {busy ? '…' : '搜'}
      </button>
    </div>
  );
}

function SongRow({
  song,
  playing,
  onPlay,
}: {
  song: Song;
  playing: boolean;
  onPlay: () => void;
}) {
  const artists = song.artists.map((a) => a.name).join(' / ');
  const safe = httpsify(song.album.picUrl);
  const cover = safe ? `${safe}?param=60y60` : null;
  return (
    <button
      type="button"
      onClick={onPlay}
      className="flex w-full items-center gap-3 rounded-lg border border-lavender-100 bg-white/80 px-3 py-2 text-left transition hover:bg-lavender-50"
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          className="h-10 w-10 shrink-0 rounded-md object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-md bg-lavender-100" />
      )}
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-sm ${
            playing ? 'font-medium text-lavender-600' : 'text-ink-900'
          }`}
        >
          {song.name}
        </div>
        <div className="truncate text-xs text-ink-500">
          {artists} · {song.album.name}
        </div>
      </div>
      {song.fee === 1 && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
          VIP
        </span>
      )}
    </button>
  );
}

function RecentlyPlayed({ onPlay }: { onPlay: (s: Song) => void }) {
  const history = useLiveQuery(
    () => db.musicHistory.orderBy('playedAt').reverse().limit(20).toArray(),
    [],
    [],
  );
  if (!history || history.length === 0) {
    return (
      <div className="mt-12 text-center text-sm text-ink-500/70">
        随便搜一首试试。
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-ink-500/80">最近听过</div>
      {history.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() =>
            onPlay({
              id: h.songId,
              name: h.name,
              artists: [{ id: 0, name: h.artist }],
              album: { id: 0, name: h.album, picUrl: h.picUrl },
              durationMs: 0,
              fee: 0,
            })
          }
          className="flex items-center gap-3 rounded-lg border border-lavender-100 bg-white/60 px-3 py-2 text-left"
        >
          {httpsify(h.picUrl) ? (
            <img
              src={`${httpsify(h.picUrl)}?param=60y60`}
              alt=""
              className="h-10 w-10 shrink-0 rounded-md object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-md bg-lavender-100" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-ink-900">{h.name}</div>
            <div className="truncate text-xs text-ink-500">{h.artist}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function MiniPlayer({
  song,
  playing,
  onToggle,
  onExpand,
  positionMs,
  durationMs,
}: {
  song: Song;
  playing: boolean;
  onToggle: () => void;
  onExpand: () => void;
  positionMs: number;
  durationMs: number;
}) {
  const safe = httpsify(song.album.picUrl);
  const cover = safe ? `${safe}?param=80y80` : null;
  const pct = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;
  return (
    <div
      className="border-t border-lavender-200 bg-white/95 backdrop-blur"
      style={{ flexShrink: 0 }}
    >
      <div className="h-0.5 bg-lavender-100">
        <div
          className="h-full bg-lavender-400 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onExpand}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              className="h-10 w-10 shrink-0 rounded-md object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-md bg-lavender-100" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm text-ink-900">{song.name}</div>
            <div className="truncate text-xs text-ink-500">
              {song.artists.map((a) => a.name).join(' / ')}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender-200 text-ink-900 hover:bg-lavender-300"
          aria-label={playing ? '暂停' : '播放'}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>
    </div>
  );
}

function FullPlayer({
  song,
  playing,
  positionMs,
  durationMs,
  lrc,
  activeLine,
  onClose,
  onToggle,
  onSeek,
}: {
  song: Song;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  lrc: LrcLine[];
  activeLine: number;
  onClose: () => void;
  onToggle: () => void;
  onSeek: (ms: number) => void;
}) {
  const safe = httpsify(song.album.picUrl);
  const cover = safe ? `${safe}?param=600y600` : null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, #f5eef8 0%, #ece5f3 60%, #e5dceb 100%)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-ink-700"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-xs text-ink-500/80">正在播放</div>
        <div className="w-9" />
      </div>

      <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-6 pb-8">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="mt-4 w-64 max-w-[80%] rounded-2xl object-cover shadow-lg"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="mt-4 h-64 w-64 max-w-[80%] rounded-2xl bg-lavender-100" />
        )}

        <div className="text-center">
          <div className="text-lg text-ink-900">{song.name}</div>
          <div className="mt-1 text-sm text-ink-500">
            {song.artists.map((a) => a.name).join(' / ')}
          </div>
        </div>

        {/* Lyrics */}
        {lrc.length > 0 && (
          <LyricsView lines={lrc} activeIndex={activeLine} />
        )}
      </div>

      <div className="border-t border-lavender-200 bg-white/40 px-6 py-4 backdrop-blur">
        <ProgressBar
          positionMs={positionMs}
          durationMs={durationMs}
          onSeek={onSeek}
        />
        <div className="mt-4 flex items-center justify-center gap-8">
          <button type="button" className="text-ink-500/50">
            <SkipBack size={20} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-lavender-300 text-ink-900 shadow-md hover:bg-lavender-400"
          >
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button type="button" className="text-ink-500/50">
            <SkipForward size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

function LyricsView({
  lines,
  activeIndex,
}: {
  lines: LrcLine[];
  activeIndex: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || activeIndex < 0) return;
    const child = el.querySelector<HTMLElement>(`[data-i='${activeIndex}']`);
    if (child) {
      child.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);
  return (
    <div
      ref={containerRef}
      className="max-h-64 w-full max-w-md overflow-y-auto text-center text-sm"
      style={{ scrollbarWidth: 'none' }}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          data-i={i}
          className={`py-1 transition-all ${
            i === activeIndex
              ? 'text-base font-medium text-ink-900'
              : 'text-ink-500/60'
          }`}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}

function ProgressBar({
  positionMs,
  durationMs,
  onSeek,
}: {
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
}) {
  function fmt(ms: number) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-ink-500">
        {fmt(positionMs)}
      </span>
      <input
        type="range"
        min={0}
        max={durationMs || 1}
        value={positionMs}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="flex-1 accent-lavender-400"
      />
      <span className="font-mono text-[10px] text-ink-500">
        {fmt(durationMs)}
      </span>
    </div>
  );
}

function UserPlaylists({
  playlists,
  loading,
  myUserId,
  onPick,
}: {
  playlists: UserPlaylist[];
  loading: boolean;
  myUserId: number;
  onPick: (p: UserPlaylist) => void;
}) {
  if (loading && playlists.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-xs text-ink-500/80">我的歌单</div>
        <div className="text-xs text-ink-500/60">拉歌单中…</div>
      </div>
    );
  }
  if (playlists.length === 0) return null;
  // 自建在前 (含「我喜欢的音乐」), 收藏在后. 网易云 UI 也是这个顺序.
  const owned = playlists.filter((p) => p.ownedByMe);
  const fav = playlists.filter((p) => !p.ownedByMe);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-ink-500/80">
        我的歌单
        <span className="ml-1.5 text-ink-500/50">({playlists.length})</span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {[...owned, ...fav].map((p) => (
          <PlaylistTile
            key={p.id}
            playlist={p}
            isMine={p.creatorId === myUserId}
            onClick={() => onPick(p)}
          />
        ))}
      </div>
    </div>
  );
}

function PlaylistTile({
  playlist,
  isMine,
  onClick,
}: {
  playlist: UserPlaylist;
  isMine: boolean;
  onClick: () => void;
}) {
  const safe = httpsify(playlist.picUrl);
  const cover = safe ? `${safe}?param=200y200` : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-1.5 text-left"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg border border-lavender-100 bg-lavender-100">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
        ) : null}
        {!isMine && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] text-ink-700 backdrop-blur">
            收藏
          </span>
        )}
        <span className="absolute bottom-1 right-1.5 text-[10px] font-medium text-white drop-shadow">
          {playlist.trackCount}
        </span>
      </div>
      <div className="line-clamp-2 text-[11px] leading-tight text-ink-700">
        {playlist.name}
      </div>
    </button>
  );
}

function PlaylistDetail({
  playlist,
  tracks,
  loading,
  currentId,
  playing,
  onBack,
  onPlay,
}: {
  playlist: UserPlaylist;
  tracks: Song[];
  loading: boolean;
  currentId: number | null;
  playing: boolean;
  onBack: () => void;
  onPlay: (s: Song) => void;
}) {
  const safe = httpsify(playlist.picUrl);
  const cover = safe ? `${safe}?param=200y200` : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-lavender-50"
        >
          <ChevronLeft size={14} />
          歌单列表
        </button>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-lavender-100 bg-white/80 p-3">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-lg bg-lavender-100" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink-900">
            {playlist.name}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-500">
            {playlist.trackCount} 首
            {!playlist.ownedByMe ? ' · 收藏' : ''}
          </div>
        </div>
      </div>
      {loading && tracks.length === 0 ? (
        <div className="text-center text-xs text-ink-500/60">加载曲目中…</div>
      ) : tracks.length === 0 ? (
        <div className="text-center text-xs text-ink-500/60">空歌单</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tracks.map((s) => (
            <li key={s.id}>
              <SongRow
                song={s}
                playing={currentId === s.id && playing}
                onPlay={() => onPlay(s)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LoginSheet({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'qr' | 'cookie'>('qr');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink-900">
            {mode === 'qr' ? '扫码登录' : 'Cookie 登录'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink-500 hover:bg-lavender-50"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mb-4 flex justify-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => setMode('qr')}
            className={`rounded-full px-3 py-1 ${
              mode === 'qr'
                ? 'bg-lavender-200 text-ink-900'
                : 'text-ink-500 hover:bg-lavender-50'
            }`}
          >
            扫码
          </button>
          <button
            type="button"
            onClick={() => setMode('cookie')}
            className={`rounded-full px-3 py-1 ${
              mode === 'cookie'
                ? 'bg-lavender-200 text-ink-900'
                : 'text-ink-500 hover:bg-lavender-50'
            }`}
          >
            用 Cookie
          </button>
        </div>
        {mode === 'qr' ? (
          <QrLoginPanel onSuccess={onSuccess} />
        ) : (
          <CookieLoginPanel onSuccess={onSuccess} />
        )}
      </div>
    </div>
  );
}

function QrLoginPanel({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [qrSvg, setQrSvg] = useState<string>('');
  const [status, setStatus] = useState<string>('生成二维码…');
  const unikeyRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    let pollHandle: number | null = null;

    async function start() {
      try {
        const k = await loginQrKey();
        if (cancelled) return;
        unikeyRef.current = k.unikey;
        const svg = await QRCode.toString(k.url, {
          type: 'svg',
          margin: 1,
          color: { dark: '#4a4458', light: '#ffffff' },
          width: 220,
        });
        if (cancelled) return;
        setQrSvg(svg);
        setStatus('用网易云音乐 app 扫码');
        poll();
      } catch (e) {
        if (!cancelled)
          setStatus('生成失败：' + (e instanceof Error ? e.message : String(e)));
      }
    }

    async function poll() {
      try {
        const r = await loginQrCheck(unikeyRef.current);
        if (cancelled) return;
        if (r.status === 'success') {
          setStatus('登录成功');
          await onSuccess();
          return;
        }
        if (r.status === 'expired') {
          setStatus('过期了，重新开');
          start();
          return;
        }
        if (r.status === 'scanned') setStatus('已扫码，在 app 里确认');
        else setStatus('用网易云音乐 app 扫码');
        pollHandle = window.setTimeout(poll, 2500);
      } catch {
        if (!cancelled) pollHandle = window.setTimeout(poll, 5000);
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (pollHandle !== null) window.clearTimeout(pollHandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <p className="mb-4 text-xs text-ink-500">{status}</p>
      <div
        className="mx-auto h-[220px] w-[220px] rounded-lg bg-white"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <p className="mt-4 text-[11px] text-ink-500/70">
        扫码被风控拦了 ({'"'}安全风险提醒 22Qd...{'"'}) 就切到「用 Cookie」.
      </p>
    </>
  );
}

function CookieLoginPanel({
  onSuccess,
}: {
  onSuccess: () => void | Promise<void>;
}) {
  const [cookie, setCookie] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const u = cookie.trim();
    if (!u) {
      setError('粘 MUSIC_U 的值进来');
      return;
    }
    setBusy(true);
    try {
      const acct = await loginByCookie(u);
      if (!acct) {
        setError('cookie 不对 / 过期了, 重新登 music.163.com 复制');
        setBusy(false);
        return;
      }
      await onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function importFromBrowser() {
    setError(null);
    setBusy(true);
    try {
      const acct = await loginByBrowserCookie();
      if (!acct) {
        setError('找到了 cookie 但验证不通过, 可能过期了 — 重新登一次');
        setBusy(false);
        return;
      }
      await onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="text-left">
      <button
        type="button"
        onClick={() => void importFromBrowser()}
        disabled={busy}
        className="mb-3 w-full rounded-lg border border-lavender-300 bg-lavender-50 px-4 py-2 text-xs text-ink-900 hover:bg-lavender-100 disabled:opacity-50"
      >
        从内置浏览器同步登录
      </button>
      <p className="mb-3 text-[10px] leading-relaxed text-ink-500/70">
        先在内置浏览器里 (建议先切桌面模式) 登 music.163.com,
        再点上面按钮自动同步. 不用手撸 cookie.
      </p>
      <div className="my-3 flex items-center gap-2 text-[10px] text-ink-500/50">
        <span className="h-px flex-1 bg-lavender-200" />
        <span>或手动粘 cookie</span>
        <span className="h-px flex-1 bg-lavender-200" />
      </div>
      <ol className="mb-3 list-decimal pl-4 text-[11px] leading-relaxed text-ink-500">
        <li>
          外部浏览器登 <span className="font-mono">music.163.com</span>
        </li>
        <li>F12 → Application → Cookies → music.163.com</li>
        <li>
          找 <span className="font-mono">MUSIC_U</span>, 复制{' '}
          <em className="italic">Value</em> 这一列
        </li>
        <li>粘到下面框里, 点登录</li>
      </ol>
      <textarea
        value={cookie}
        onChange={(e) => setCookie(e.target.value)}
        placeholder="MUSIC_U 值, 一长串字符…"
        rows={4}
        className="w-full resize-none rounded-lg border border-lavender-200 bg-lavender-50/60 p-2.5 font-mono text-[11px] text-ink-900 focus:border-lavender-300 focus:outline-none"
      />
      {error && (
        <p className="mt-2 text-[11px] text-rose-500">{error}</p>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-lavender-300 px-4 py-2 text-sm text-ink-900 hover:bg-lavender-400 disabled:opacity-50"
      >
        {busy ? '验证中…' : '登录'}
      </button>
      <p className="mt-3 text-[10px] text-ink-500/70">
        Cookie 存在本机系统 cookie 罐, 跟 NetEase 自己 app 同一份, 不发任何第三方.
      </p>
    </div>
  );
}
