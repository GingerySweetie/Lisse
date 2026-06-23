import { db } from '../../db';
import { newId } from '../id';
import { search as searchNetease } from '../music/netease-api';
import type { Tool, ToolContext } from './index';

/**
 * 音乐工具 — 让 persona 在聊天里搜歌 / 点歌 / 看历史. 走的全是
 * 本地已经接好的 `lib/music/netease-api.ts` (Cookie 登录态都在),
 * 不依赖任何外部 MCP server.
 *
 * 三个工具:
 *
 *   play_song(keyword)  — 搜 NetEase 取第一条结果, 写一条 "待播放"
 *                         请求到 db.kv. 音乐页 (无论是否打开) 都会
 *                         在 mount 时读这个 key, 起播 + 清掉. AI
 *                         拿到 song 信息后告诉用户「放了什么」.
 *
 *   search_song(keyword) — 单纯搜, 返回前 5 条. AI 可以让用户挑.
 *
 *   recent_songs(limit?) — 读 db.musicHistory 最近播过的. limit
 *                          默认 10, 上限 30.
 *
 * 当 AI 调 play_song 时, 用户不一定在音乐页. 我们写 db.kv 的
 * pending 请求, 音乐页 mount 后会消费. 不在音乐页时, AI 文案应
 * 该提示用户去音乐页 (eg. "我点了 xxx, 在音乐页可以听").
 */

const PENDING_PLAY_KEY = 'music_pending_play';

export interface MusicPendingPlay {
  songId: number;
  name: string;
  artist: string;
  album: string;
  picUrl?: string;
  /** ms epoch — 让 Music.tsx 判重, 避免重复消费旧请求. */
  requestedAt: number;
}

export async function musicTools(_ctx: ToolContext): Promise<Tool[]> {
  return [playSongTool(), searchSongTool(), recentSongsTool()];
}

function playSongTool(): Tool {
  return {
    def: {
      name: 'play_song',
      description:
        '搜 NetEase 取第一条结果, 推到音乐页让她播放. 用户不一定开着音乐页 — 调完之后告诉她去看. 适合用户说"放一首 XX" 或对话氛围明显适合放某首歌时主动用.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '搜索关键词. 可以是「歌名」/「歌名 歌手」/「歌手 歌名」.',
          },
        },
        required: ['keyword'],
      },
    },
    handler: async (input: unknown) => {
      const keyword = (input as { keyword?: string })?.keyword?.trim();
      if (!keyword) return { error: 'keyword 不能为空' };
      try {
        const songs = await searchNetease(keyword);
        const top = songs[0];
        if (!top) return { error: '没搜到结果' };
        const pending: MusicPendingPlay = {
          songId: top.id,
          name: top.name,
          artist: top.artists.map((a) => a.name).join(' / '),
          album: top.album.name,
          picUrl: top.album.picUrl,
          requestedAt: Date.now(),
        };
        await db.kv.put({ key: PENDING_PLAY_KEY, value: pending });
        // 同步入历史 (Music 页打开时会再写一次, 这里先记一笔以防
        // 用户始终不开音乐页)
        await db.musicHistory.put({
          id: newId(),
          songId: top.id,
          name: top.name,
          artist: pending.artist,
          album: top.album.name,
          picUrl: top.album.picUrl,
          playedAt: Date.now(),
        });
        return {
          queued: true,
          name: top.name,
          artist: pending.artist,
          album: top.album.name,
          isVip: top.fee === 1,
          hint: 'AI: 用户没在音乐页时, 提示 ta 去 /music 看 / 听.',
        };
      } catch (e) {
        return {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  };
}

function searchSongTool(): Tool {
  return {
    def: {
      name: 'search_song',
      description:
        '搜 NetEase, 返回前 5 条结果让 AI 在对话里讲. 不立刻播放. 用户在挑歌 / 你不确定哪一首是她想要的时用这个.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词.' },
        },
        required: ['keyword'],
      },
    },
    handler: async (input: unknown) => {
      const keyword = (input as { keyword?: string })?.keyword?.trim();
      if (!keyword) return { error: 'keyword 不能为空' };
      try {
        const songs = await searchNetease(keyword);
        return {
          results: songs.slice(0, 5).map((s) => ({
            id: s.id,
            name: s.name,
            artist: s.artists.map((a) => a.name).join(' / '),
            album: s.album.name,
            isVip: s.fee === 1,
          })),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

function recentSongsTool(): Tool {
  return {
    def: {
      name: 'recent_songs',
      description: '看用户最近播过的歌. 适合在「你最近爱听什么」「记得那首…」时用.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '取多少条, 默认 10, 上限 30.',
          },
        },
      },
    },
    handler: async (input: unknown) => {
      const limit = Math.min(
        30,
        Math.max(1, (input as { limit?: number })?.limit ?? 10),
      );
      const rows = await db.musicHistory
        .orderBy('playedAt')
        .reverse()
        .limit(limit)
        .toArray();
      return {
        history: rows.map((r) => ({
          name: r.name,
          artist: r.artist,
          album: r.album,
          playedAt: new Date(r.playedAt).toISOString(),
        })),
      };
    },
  };
}
