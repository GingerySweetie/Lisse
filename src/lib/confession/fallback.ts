import type { ConfessionEntry } from '../../types';
import { RIRICHAN_ID } from './defaults';
import { confessionEntryId, formatLocalDate } from './format';

/** Offline / no-trigger fallback vignettes for the catch flow only — not archived. */
export interface FallbackDesire {
  id: string;
  title: string;
  confession: string;
  enact: string[];
  after: string;
}

export const FALLBACK_DESIRES: FallbackDesire[] = [
  {
    id: 'collar',
    title: '项圈',
    confession:
      '……她其实想要被拴着。不是比喻。想要一条只有我能解的环，贴着喉结，走路时轻轻响。她白天装得很干净，可我知道那截脖子空着的时候她有多痒。',
    enact: [
      '铁格后面的呼吸断了一拍。理理酱抬眼，烛火在他瞳里晃。',
      '「……撞见了。」他没有退。指尖已经扣住你的后颈，拇指按在你喉结旁。',
      '「既然听完了——」金属凉意贴上来，项圈合上，咔哒一声轻得过分。「那就先从你开始。」',
      '他拉紧短链，把你拽进拱顶阴影里。吻落在你嘴角，却带着惩罚的意味：「不许再装听不见。」',
    ],
    after: '链子还绕在他手指上。告解室重新暗下去，只剩你们两人的呼吸。',
  },
  {
    id: 'ownership',
    title: '占有',
    confession:
      '她是我的。这句话在告解室里说一万次也不够。我想要她身上只留我的味道，日程里只留我的空档，连做梦都得先经过我同意——我知道这很坏。可我就是想。',
    enact: [
      '话音未落，你已经站在门口。理理酱怔住，随即像终于等到这一刻。',
      '「正好。」他关上门，反锁，烛火晃了一下。「你来听判决。」',
      '他把你抵在拱壁上，鼻尖蹭过你颈侧，深深吸气：「从现在起，呼吸也算我的。」',
      '手扣进你的指缝，十指交缠到发疼：「出去再说一次你是自由的试试看。」',
    ],
    after: '锁还没开。他额头抵着你的，安静了很久，才说：「……告解结束了。你还属于我。」',
  },
];

export const SEALED_LINES = [
  '门关着。格栅后只有烛灰的味道。',
  '你贴上去听——什么都没有。或者他故意屏住了呼吸。',
  '拱顶里有人在，可钥匙不在你这边。',
  '木门沉沉的。里面翻过一页纸，随即又静了。',
  '你看不见。隔板把一切切成黑与更黑。',
  '靠近时脚步太响。帘后的呼吸停了，像从来没人在。',
  '告解室谢绝旁听。今晚如此。',
];

export function pickSealedLine(): string {
  return SEALED_LINES[Math.floor(Math.random() * SEALED_LINES.length)]!;
}

export function pickFallbackDesire(): FallbackDesire {
  return FALLBACK_DESIRES[Math.floor(Math.random() * FALLBACK_DESIRES.length)]!;
}

/** Ephemeral entry for UI only — not written to Dexie. */
export function fallbackAsEntry(desire: FallbackDesire): ConfessionEntry {
  const now = Date.now();
  const date = formatLocalDate(new Date());
  return {
    id: confessionEntryId(date, RIRICHAN_ID) + '|fallback',
    date,
    personaId: RIRICHAN_ID,
    title: desire.title,
    confession: desire.confession,
    enact: desire.enact,
    after: desire.after,
    spark: '（备用稿 · 未入库）',
    model: '',
    endpointId: '',
    conversationIds: [],
    status: 'done',
    createdAt: now,
    updatedAt: now,
  };
}
