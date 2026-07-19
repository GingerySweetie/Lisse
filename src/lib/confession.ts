/**
 * 告解室 — 理理酱在拱顶里低语你的阴暗欲望。
 * 平时门关着、看不见；靠近时有概率撞见；撞见后他会把所告解的欲望发泄在你身上。
 */

export interface ConfessionDesire {
  id: string;
  /** Short name shown in the caught flash. */
  title: string;
  /** What 理理酱 was whispering to the dark (second person = you). */
  confession: string;
  /** What happens to you once you're caught. */
  enact: string[];
  /** Aftermath line after the enactment. */
  after: string;
}

export const CONFESSION_DESIRES: ConfessionDesire[] = [
  {
    id: 'collar',
    title: '项圈',
    confession:
      '……他其实想要被拴着。不是比喻。想要一条只有我能解的环，贴着喉结，走路时轻轻响。他白天装得很干净，可我知道那截脖子空着的时候他有多痒。',
    enact: [
      '铁格后面的呼吸断了一拍。理理酱抬眼，烛火在他瞳里晃。',
      '「……撞见了。」他没有退。指尖已经扣住你的后颈，拇指按在你喉结旁。',
      '「既然听完了——」金属凉意贴上来，项圈合上，咔哒一声轻得过分。「那就先从你开始。」',
      '他拉紧短链，把你拽进拱顶阴影里。吻落在你嘴角，却带着惩罚的意味：「不许再装听不见。」',
    ],
    after: '链子还绕在他手指上。告解室重新暗下去，只剩你们两人的呼吸。',
  },
  {
    id: 'kneel',
    title: '跪',
    confession:
      '他想跪。不是求饶那种——是想被按着膝盖贴到地上，抬头看我，眼睛湿着，嘴里什么都说不出来，只能等我开口。那种下贱他白天打死都不会承认。',
    enact: [
      '帘子猛地被掀开。理理酱的声音还停在半句，看见你，先是僵，随即笑了一下——很小，很坏。',
      '「听墙角？」他跨出一步，掌心按上你的肩，「跪下。」',
      '你还没反应过来，膝弯已被他顶软。石砖冰凉。他俯视你，指尖擦过你下唇：「告解完的人，有权执行。」',
      '他拇指探进你嘴里，声音贴着你耳廓：「张嘴。把你刚才偷听的那点兴奋，还给我。」',
    ],
    after: '膝上还留着石砖的凉。他蹲下来，忽然又轻轻亲了你额头一下。',
  },
  {
    id: 'mark',
    title: '痕迹',
    confession:
      '想在他身上留印。锁骨、大腿内侧、能被衣领刚好挡住又刚好露出来的地方。想让他照镜子的时候想起是谁咬的——想让他不敢穿低领，又忍不住去摸。',
    enact: [
      '告解中断。理理酱一把拽开格栅侧门，把你拖进烛影。',
      '「偷听我讲怎么咬你？」他咬字很轻，「那就别只听。」',
      '唇齿落在你锁骨上，先是舔，再是吮，直到皮肤发热发疼。他抬起头，眼神发亮：「这里。回去遮好——或者别遮。」',
      '第二口更低，靠近衣领边缘。他喘着气贴着你耳边：「下次再撞见，我留在看得见的地方。」',
    ],
    after: '你的皮肤还在跳。他用指腹抹过那块红痕，像在给自己的作品收尾。',
  },
  {
    id: 'voice',
    title: '声音',
    confession:
      '我想听他哭出来。不是伤心——是被弄到受不住、还要咬着嘴唇不让人听见的那种。我想逼他叫我的名字，叫到嗓子哑，叫到他自己都觉得丢脸。',
    enact: [
      '格栅后的低语骤停。下一秒门被从里拉开，理理酱的手已经捂住你的嘴。',
      '「嘘。这里隔音不好。」他眼睛很亮，「可你既然来了——」',
      '他松开手，改捏你的下巴，逼你看着他：「现在换你出声。」',
      '指节沿着你侧腰往下，不紧不慢。他贴着你嘴唇几乎要吻上：「叫我。叫不清就不停。」',
    ],
    after: '拱顶里回音散尽。他用指腹擦你眼角，语气忽然软了一点：「……下次门会锁紧一点。」',
  },
  {
    id: 'ownership',
    title: '占有',
    confession:
      '他是我的。这句话在告解室里说一万次也不够。我想要他身上只留我的味道，日程里只留我的空档，连做梦都得先经过我同意——我知道这很坏。可我就是想。',
    enact: [
      '话音未落，你已经站在门口。理理酱怔住，随即像终于等到这一刻。',
      '「正好。」他关上门，反锁，烛火晃了一下。「你来听判决。」',
      '他把你抵在拱壁上，鼻尖蹭过你颈侧，深深吸气：「从现在起，呼吸也算我的。」',
      '手扣进你的指缝，十指交缠到发疼：「出去再说一次你是自由的试试看。」',
    ],
    after: '锁还没开。他额头抵着你的，安静了很久，才说：「……告解结束了。你还属于我。」',
  },
  {
    id: 'ruin',
    title: '弄坏',
    confession:
      '想把他弄到站不稳。衣服皱着，眼睛红着，连完整的句子都拼不出来。想看那个平时清清爽爽的他，被我一点点拆开——然后他还会自己凑过来，求我继续。',
    enact: [
      '你撞见的瞬间，理理酱已经站起来。告解词还挂在空气里，他却先笑了。',
      '「原来你也想听这个。」他走近，指尖勾住你的腰带系带，「那别站着了。」',
      '背脊碰着冷石壁。他膝盖顶进你两腿之间，呼吸乱得毫不掩饰：「我会慢一点。让你记得每一寸是怎么坏掉的。」',
      '吻落下来，深且不容拒绝。低语混在唇齿间：「坏给我看。」',
    ],
    after: '烛芯噼啪一声。他帮你整理领口，动作很轻，眼神却还没收回去。',
  },
  {
    id: 'watch',
    title: '窥视',
    confession:
      '有时候我想让他看着我做那些事。不是碰他——是让他坐在对面，手被绑着，只能看。看我怎么为他失控，看他自己先崩。那种被注视的羞耻，比碰更狠。',
    enact: [
      '门缝外的脚步声出卖了你。理理酱掀帘，目光直接钉住你。',
      '「偷看告解？」他把你拽到木椅上，抽出束带绕住你的腕，「那你就好好看。」',
      '他退开半步，在你面前慢慢解开领口第一颗扣，声音发哑：「不许闭眼。闭一次，就多加一条规矩。」',
      '烛火把影子拉得很长。他俯身，唇几乎贴上你的：「记住你现在这副样子——以后都是我的。」',
    ],
    after: '束带松开时你腕上留着浅痕。他低头亲了一下那道痕，像盖章。',
  },
  {
    id: 'deny',
    title: '拒绝',
    confession:
      '我想吊着他。让他要、让他求、让他几乎碰到——然后停下。看他眼眶红了还得说谢谢。残忍吗？可一想到他为此发抖的样子，我就硬得发疼。',
    enact: [
      '告解被你打断。理理酱的表情空白一瞬，随即换成近乎愉悦的阴沉。',
      '「来得正好。」他捉住你的手，按在自己心口——烫的——又慢慢移开，「碰得到，不许拿。」',
      '他吻你，深到你以为会继续，却在最紧的时候退开一寸：「求我。」',
      '你开口的瞬间他又吻回去，咬你下唇：「太快了。再忍一会儿——我喜欢看你这样。」',
    ],
    after: '他终于把额头靠过来，喘着气笑：「……今天的告解，算你共犯。」',
  },
];

/** Denied / sealed outcomes when you fail to catch him. */
export const SEALED_LINES = [
  '门关着。格栅后只有烛灰的味道。',
  '你贴上去听——什么都没有。或者他故意屏住了呼吸。',
  '拱顶里有人在，可钥匙不在你这边。',
  '木门沉沉的。里面翻过一页纸，随即又静了。',
  '你看不见。隔板把一切切成黑与更黑。',
  '靠近时脚步太响。帘后的呼吸停了，像从来没人在。',
  '告解室谢绝旁听。今晚如此。',
];

/** Muffled whisper fragments that sometimes leak when sealed (tease, not full reveal). */
export const WHISPER_FRAGMENTS = [
  '「……他不知道我……」',
  '「……想把他……」',
  '「……只有这里能说……」',
  '「……对不起，我又……」',
  '「……下次撞见的话……」',
  '「……这份脏，收好……」',
];

const STORAGE_KEY = 'lisse-confession-state';
const COOLDOWN_MS = 20 * 60 * 1000; // 20 min after a catch
/** Base probability of catching when approaching. */
export const CATCH_CHANCE = 0.22;

interface StoredState {
  lastCatchAt?: number;
  lastDesireId?: string;
  approachCount?: number;
}

function readState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredState;
  } catch {
    return {};
  }
}

function writeState(s: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

export function pickSealedLine(): string {
  return SEALED_LINES[Math.floor(Math.random() * SEALED_LINES.length)]!;
}

export function pickWhisper(): string {
  return WHISPER_FRAGMENTS[Math.floor(Math.random() * WHISPER_FRAGMENTS.length)]!;
}

export function pickDesire(excludeId?: string): ConfessionDesire {
  const pool = excludeId
    ? CONFESSION_DESIRES.filter((d) => d.id !== excludeId)
    : CONFESSION_DESIRES;
  const list = pool.length > 0 ? pool : CONFESSION_DESIRES;
  return list[Math.floor(Math.random() * list.length)]!;
}

export type ApproachResult =
  | { kind: 'sealed'; line: string; whisper?: string }
  | { kind: 'caught'; desire: ConfessionDesire };

/**
 * Roll whether the user catches 理理酱 mid-confession.
 * Cooldown after a successful catch; chance rises slightly with failed approaches.
 */
export function approachConfession(): ApproachResult {
  const state = readState();
  const now = Date.now();
  const onCooldown =
    typeof state.lastCatchAt === 'number' &&
    now - state.lastCatchAt < COOLDOWN_MS;

  const approaches = (state.approachCount ?? 0) + 1;
  // Soft pity: +3% per failed approach, capped, ignored during cooldown.
  const pity = Math.min(0.18, (state.approachCount ?? 0) * 0.03);
  const chance = onCooldown ? 0 : CATCH_CHANCE + pity;

  const hit = Math.random() < chance;

  if (!hit) {
    writeState({ ...state, approachCount: approaches });
    const whisper = Math.random() < 0.35 ? pickWhisper() : undefined;
    return { kind: 'sealed', line: pickSealedLine(), whisper };
  }

  const desire = pickDesire(state.lastDesireId);
  writeState({
    lastCatchAt: now,
    lastDesireId: desire.id,
    approachCount: 0,
  });
  return { kind: 'caught', desire };
}

/** Dev / UI helper: force a catch without cooldown. */
export function forceCatch(): ApproachResult {
  const state = readState();
  const desire = pickDesire(state.lastDesireId);
  writeState({
    lastCatchAt: Date.now(),
    lastDesireId: desire.id,
    approachCount: 0,
  });
  return { kind: 'caught', desire };
}
