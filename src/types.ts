export type EndpointFormat = 'openai' | 'anthropic';

export interface Endpoint {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  format: EndpointFormat;
  chatModels: string[];
  embeddingModels: string[];
  /** "Authorization: Bearer" vs "x-api-key". Anthropic-native usually requires x-api-key. */
  authStyle: 'bearer' | 'x-api-key';
  /** anthropic-version header (only for format=anthropic). */
  anthropicVersion?: string;
  /** Enable Anthropic extended thinking on this endpoint (model must support). */
  thinkingEnabled?: boolean;
  /** Token budget for thinking (Anthropic). 1024 minimum, 16000 typical. */
  thinkingBudget?: number;
  /** Use Anthropic's 1-hour cache TTL instead of the 5-minute default.
   *  2x cost per write, same 10% read price; pays off when conversations
   *  pause > 5 min between turns. */
  cacheLongTTL?: boolean;
  /** AIHubMix-specific second credential: balance / quota queries need
   *  the Manage Key (separate from the chat API key). Other providers
   *  ignore it. */
  manageKey?: string;
  createdAt: number;
  updatedAt: number;
}

export type Role = 'system' | 'user' | 'assistant';

/** One tool call the model made and (usually) executed. Stored on the
 *  assistant message so we can replay it and so the bubble can show
 *  what happened ("📝 记住了 …", "🔍 查 …"). */
export interface ToolCallRecord {
  id: string;
  name: string;
  /** Parsed input arguments (JSON object). */
  input: unknown;
  /** Result of the tool's handler, if it ran. */
  result?: unknown;
  /** Error message if the handler threw or the args were malformed. */
  error?: string;
}

export interface Attachment {
  id: string;
  kind: 'image' | 'file';
  /** MIME type, e.g. "image/png", "application/pdf". */
  mimeType: string;
  /** Base64-encoded payload, no data URL prefix. */
  data: string;
  /** Display filename for non-image attachments. */
  filename?: string;
  /** Byte size for display. */
  size?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  /** parent message id; null for root. Enables ChatGPT-style branch tree. */
  parentId: string | null;
  role: Role;
  content: string;
  /** Attached images / files for this message (user uploads or assistant returns). */
  attachments?: Attachment[];
  /** Model's internal reasoning text (Anthropic extended thinking, etc.). */
  thinking?: string;
  /** In a group conversation, which persona authored this assistant turn.
   *  Undefined for user messages, system messages, and single-persona convos. */
  personaId?: string;
  /** Reading context anchor: which slice of the book this message is
   *  commenting on. Used to give the assistant the focal passage. */
  bookAnchor?: {
    /** Character offset into the book content where the user was. */
    position: number;
    /** The text the user highlighted, or null if they just commented from
     *  the scroll position. */
    selection?: string;
    /** Pre-computed surrounding excerpt for the prompt (±~400 chars). */
    excerpt: string;
  };
  /** which child id is "active" when navigating this branch point. */
  activeChildId?: string | null;
  /** runtime status used during streaming. */
  status?: 'streaming' | 'done' | 'error';
  errorMessage?: string;
  endpointId?: string;
  model?: string;
  /** Tool calls the model made during this assistant turn (in order). For
   *  user/system messages, undefined. Persisted so the model can be
   *  regenerated against the same prior context. */
  toolCalls?: ToolCallRecord[];
  createdAt: number;
  /** token usage if returned by API. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
}

export interface Conversation {
  id: string;
  title: string;
  /** id of currently-displayed leaf message in the tree. */
  currentLeafId: string | null;
  /** default endpoint+model for new turns in this conversation. */
  defaultEndpointId?: string;
  defaultModel?: string;
  /** persona/system prompt key (v0.5+). */
  personaId?: string;
  /** When set, this conversation is a group: every persona in the list
   *  participates, and each assistant turn is authored by one of them. */
  personaIds?: string[];
  /** Per-persona endpoint+model override. For group chats where each
   *  persona is wired to a different model. If a persona has no entry,
   *  the conversation's defaultEndpointId / defaultModel is used. */
  personaModels?: Record<string, { endpointId: string; model: string }>;
  /** Writing style applied to every assistant turn in this conversation. */
  styleId?: string;
  /** if imported from ChatGPT, original conversation id. */
  sourceId?: string;
  source?: 'native' | 'chatgpt' | 'claude';
  /** When set, this conversation is the discussion thread for a book. */
  bookId?: string;
  /** Special room marker — e.g. 'bedroom' for intimate per-persona threads,
   *  'living-room' for the 理理酱+Rhema酱 三人群聊 singleton. These
   *  conversations are hidden from the main conversation sidebar. */
  room?: 'bedroom' | 'living-room';
  /** Per-conversation accent color (hex). Independent of persona — the user
   *  picks it after choosing who to talk to. Used for the user's own bubble
   *  and small UI accents. Falls back to the default sky tone when unset. */
  accentColor?: string;
  /** Bedroom theme id (see BEDROOM_THEMES). Only meaningful when
   *  room='bedroom'. Decouples the room's color palette from the
   *  persona so the user picks who first, color second. */
  bedroomTheme?: string;
  /** Timestamp of the last memory backfill over this conversation's history.
   *  Used to gray out already-backfilled rows in the batch UI. */
  memoryBackfilledAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  /** Selected endpoint+model used when creating new conversations. */
  defaultEndpointId: string | null;
  defaultModel: string | null;
  /** Selected persona used when creating new conversations. */
  defaultPersonaId: string | null;
  /** Selected writing style used when creating new conversations. */
  defaultStyleId: string | null;
  /** Theme preference, future: 'light' | 'dark' | 'auto'. */
  theme: 'light';

  // ─── Memory ───
  memoryEnabled: boolean;
  /** Endpoint id used for embedding API calls. */
  embeddingEndpointId: string | null;
  embeddingModel: string | null;
  /** Endpoint id used for fact extraction (a small/cheap chat model). */
  extractorEndpointId: string | null;
  extractorModel: string | null;
  /** Top-K facts to retrieve and inject per turn. */
  retrievalTopK: number;
  /** Minimum cosine similarity to include a retrieved fact. */
  retrievalThreshold: number;
  /** Maximum recent message pairs to send each turn (null = unlimited). */
  maxHistoryTurns: number | null;
  /** When true, expose remember/recall tools to the chat model. Requires
   *  memoryEnabled + embedding endpoint to function. Default off. */
  toolsEnabled: boolean;
  /** When true, applying a freshly-installed Service Worker no longer
   *  needs the user to tap the update banner — the app reloads itself
   *  as soon as the new version is detected. Default on. */
  autoApplyUpdate: boolean;

  // ─── Bill-capture source toggles ───
  /** Notification-listener path for Alipay + WeChat. Default ON. */
  billSrcAlipayWechat: boolean;
  /** Notification-listener path for banks (招行 etc., once package added).
   *  Default ON, but no effect until the user reports a real package name. */
  billSrcBankNotification: boolean;
  /** Screen-read fallback (AccessibilityService) for Alipay/WeChat
   *  foreground only. Default OFF — user must opt in twice (here +
   *  system Settings). */
  billSrcScreenAccessibility: boolean;

  // ─── In-app browser ───
  /** Override UA string sent by the in-app browser WebView. Null = use
   *  the device's default WebView UA. A common reason to override:
   *  some sites gate features on UA sniffing. */
  browserUserAgent: string | null;
}

export interface Persona {
  id: string;
  name: string;
  /** Short tag/avatar character (emoji or 1-2 letters). */
  avatar: string;
  /** Accent color used for chips/badges. */
  color: string;
  /** System prompt injected at the start of every conversation using this persona. */
  systemPrompt: string;
  /** Free-form notes for the user; not sent to the model. */
  notes?: string;
  /** Built-in personas can't be deleted, only edited. */
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Writing style. Independent of persona — styles shape register/format
 * (concise / explanatory / formal / literary), persona shapes identity.
 * Both prompts get composed into the final system prompt.
 */
export interface WritingStyle {
  id: string;
  name: string;
  /** Short label shown in the picker, e.g. "极简". */
  shortLabel?: string;
  /** Optional 1-line description for the editor. */
  description?: string;
  /** Prompt block appended to system after persona + memory. */
  prompt: string;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * A book stored locally for the in-app reader. Content is the full text;
 * format affects rendering only. Each book has at most one primary
 * conversation (the "reading group chat") where commentary lives.
 */
export interface Book {
  id: string;
  title: string;
  author?: string;
  content: string;
  format: 'txt' | 'md';
  /** Cached length of content in characters, for progress / scrubber. */
  totalChars: number;
  /** Linked conversation where comments live. Set on first comment. */
  conversationId?: string;
  /** Last reading position (character offset into content). */
  lastPosition?: number;
  /** Cached TOC extracted from headings (md) or 章节 markers (txt). */
  toc?: TocEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface TocEntry {
  title: string;
  /** Character offset into book.content. */
  position: number;
  /** Heading level — 1 = top, deeper levels indent further. */
  level: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  /** Character offset into book.content. */
  position: number;
  /** First ~60 chars of the body at the bookmark, for the list label. */
  snippet: string;
  /** Optional free-form note the user added. */
  note?: string;
  createdAt: number;
}

/** Period log entry. Anchors the cycle: each entry is a "this is when
 *  my period started" record. endDate optional; if absent, presumed
 *  still ongoing. Used by the body page to compute current day, average
 *  cycle length, predicted next start. */
export interface PeriodEntry {
  id: string;
  /** YYYY-MM-DD (local date string). */
  startDate: string;
  /** YYYY-MM-DD or absent. */
  endDate?: string;
  notes?: string;
  createdAt: number;
}

/** A discovered MCP tool (cached on the server row for offline + faster
 *  tool registration). Mirrors the spec's tools/list response item. */
export interface McpToolDef {
  name: string;
  description?: string;
  /** JSON Schema for the tool's arguments. */
  inputSchema: Record<string, unknown>;
}

/**
 * OAuth 2.1 state for MCP servers that require user authorization (e.g.
 * Notion, GitHub). Populated after the browser callback finishes the
 * Authorization Code + PKCE flow described in the MCP spec (RFC 9470 for
 * resource discovery + RFC 8414 for auth-server metadata + RFC 7591 for
 * dynamic client registration).
 */
export interface McpOAuth {
  /** OAuth authorization server issuer URL (from RFC 8414 metadata). */
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  /** Dynamic-registration-assigned client id. Public clients only, so no
   *  client_secret is stored (we always register with
   *  token_endpoint_auth_method=none). */
  clientId: string;
  /** Long-lived refresh token; used to mint fresh access tokens. */
  refreshToken?: string;
  /** Current bearer, sent as `Authorization: Bearer <accessToken>`. */
  accessToken?: string;
  /** Unix ms when the current access token expires. */
  expiresAt?: number;
  /** Scopes actually granted by the last successful token response. */
  scope?: string;
  /** When authorization was last completed / refreshed. */
  connectedAt?: number;
}

/**
 * Model Context Protocol server registration. The chat layer uses the
 * Streamable HTTP transport — a single URL endpoint that accepts JSON-RPC
 * over POST and optionally streams responses via SSE.
 */
export interface McpServer {
  id: string;
  /** User-facing name; also used as the namespace prefix for tool names. */
  name: string;
  /** Endpoint URL of the MCP server. */
  url: string;
  /** Optional static Authorization header value (e.g. "Bearer xxx"). Used
   *  when the server accepts a bring-your-own token (self-hosted /
   *  integration token / PAT). Mutually exclusive with `oauth`. */
  authHeader?: string;
  /** OAuth 2.1 + PKCE credentials, populated when the user completes an
   *  authorization flow. Takes precedence over authHeader when present. */
  oauth?: McpOAuth;
  /** Disabled servers are skipped during tool discovery. */
  enabled: boolean;
  /** Cached tools/list result so chat can register without a network round
   *  trip on every send. Refreshed on demand from the management page. */
  cachedTools?: McpToolDef[];
  /** When the cache was last filled. */
  cachedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Single weight reading. Body page shows latest kg, sparkline of recent
 *  history, and ΔvsLastWeek. */
export interface WeightEntry {
  id: string;
  /** YYYY-MM-DD (local). */
  date: string;
  /** Kilograms. */
  kg: number;
  notes?: string;
  createdAt: number;
}

/** Bookmark on the in-app browser home tile grid. */
export interface BrowserBookmark {
  id: string;
  name: string;
  url: string;
  /** Two-character emoji or short glyph for the tile face. */
  glyph?: string;
  /** Display order; smaller first. */
  position: number;
  createdAt: number;
  updatedAt: number;
}

/** A bookmarklet: JS code the user can fire (or auto-fire) in the browser. */
export interface BrowserScript {
  id: string;
  name: string;
  /** Raw JS body. May start with `javascript:` — the native side strips it. */
  code: string;
  /** When autoRun is on, code fires on every onPageFinished whose URL
   *  contains urlPattern (case-insensitive). Empty pattern = match all. */
  urlPattern?: string;
  autoRun: boolean;
  createdAt: number;
  updatedAt: number;
}

/** NetEase Cloud Music login state. Singleton row (id = 'netease'). */
export interface MusicCredentials {
  id: 'netease';
  userId: number;
  nickname: string;
  avatarUrl?: string;
  /** vipType > 0 = VIP. Used to badge the user, not gate anything. */
  vipType: number;
  savedAt: number;
}

/** A track the user has played, for "recently played" + auto-complete. */
export interface MusicHistoryEntry {
  id: string;
  songId: number;
  name: string;
  artist: string;
  album: string;
  picUrl?: string;
  playedAt: number;
}

/**
 * OnlyCircle — 私人朋友圈. 一条 post 是用户发出去的动态. 只有
 * 用户和她的两个 AI 恋人能看到 (没有公开机制, 不上传任何服务器).
 */
export interface CirclePost {
  id: string;
  /** 动态正文. 支持多行。 */
  text: string;
  /** 附图. base64 data URLs (无 prefix), 跟 Attachment.data 同格式。
   *  目前限制最多 9 张. */
  images: string[];
  /** 用户自己有没有给这条 post 点心. 切换不影响 AI 评论. */
  userLiked?: boolean;
  createdAt: number;
}

/** OnlyCircle 一条反应. 同一 persona 对同一 post 多次反应也存多
 *  条 — 用户可以手动「让 X 再说」追加新评论, 历史保留.
 *
 *  v2 加 parentReactionId: 用户回复某条 AI 评论时, reply row 的
 *  parentReactionId 指向那条原评论, AI 接着也可以再回复用户的
 *  reply (形成 thread). 顶层评论 parentReactionId 为空.
 *
 *  v2 也支持 personaId = USER_REACTION_PERSONA_ID ('__user__') 表
 *  示这是用户自己写的回复, 不走 db.personas. */
export interface CircleReaction {
  id: string;
  postId: string;
  /** 谁的反应. personaId 关联 db.personas, 或 '__user__' 表用户. */
  personaId: string;
  /** "comment" — 评论 (含用户回复), "like" — 点赞 (text 可空). */
  kind: 'comment' | 'like';
  /** 评论正文; kind=like 时为空. */
  text: string;
  /** 'pending' = 还在生成 / 调用 API 中; 'done' / 'error'. 用户
   *  自己写的 reply 直接进 'done'. */
  status: 'pending' | 'done' | 'error';
  errorMessage?: string;
  /** thread 用. 设了 = 这条是对哪条 reaction 的回复. */
  parentReactionId?: string;
  createdAt: number;
}

/** 用户自己 reaction 的占位 personaId. 跟 db.personas 不重名. */
export const USER_REACTION_PERSONA_ID = '__user__';

/**
 * Health Connect 读穿透缓存. MIUI 杀后台后 Gadgetbridge 写进 HC 的
 * 数据可能被清掉, Body 页 pull 时变成 0. 这里按 (type, date) 维度
 * 存最近一次 HC 实际返回的非空数据, HC 没读到就 fallback 回来.
 *
 * type 一类一条 row, put 时按 [type+date] 复合主键覆盖, 不累积
 * 历史 — 同一天反复刷新只留最新的非空快照。
 */
export interface HealthCacheRow {
  /** "type|YYYY-MM-DD" — 复合 key 自己拼以兼容 Dexie 主键单字段限制. */
  id: string;
  /** 数据种类: 'steps' / 'heartRate' / 'heartSeries' / 'sleep' / 'weekSteps'. */
  type: string;
  /** 本地日期, YYYY-MM-DD. weekSteps 也按今日日期分桶 (它本身覆盖过去 7 天). */
  date: string;
  /** 完整读取结果 JSON 字符串. 反序列化负担放到读路径上, 写时直接 stringify. */
  data: string;
  /** 写入时间戳, UI 上显示 "缓存 · N 分钟前". */
  updatedAt: number;
}

/**
 * AI 对一天健康数据的吐槽 / 关心. 每个 persona 对一天一条 — 复合
 * 主键 "date|personaId" 防止刷新页面重复调用 API.
 */
export interface HealthComment {
  /** "YYYY-MM-DD|personaId" */
  id: string;
  /** YYYY-MM-DD 本地日期. */
  date: string;
  /** 关联 db.personas. */
  personaId: string;
  text: string;
  status: 'pending' | 'done' | 'error';
  errorMessage?: string;
  createdAt: number;
}

/**
 * 每日健康汇总快照. Body 页面每次拉到非空 HC 数据时落一条, 给周
 * /月/年报告页用. 同一天反复 put 覆盖 (id = 日期), 不累积.
 */
export interface HealthDailySnapshot {
  /** YYYY-MM-DD */
  id: string;
  date: string;
  /** 步数. 0 = 无数据. */
  steps: number;
  /** 心率 latest / min / max. null 表示无数据. */
  heartRate: {
    latest: number | null;
    min: number | null;
    max: number | null;
  };
  /** 睡眠总分钟数 + 各分期累计分钟. 没分期数据时除 total 外都 0. */
  sleep: {
    totalMin: number;
    deepMin: number;
    lightMin: number;
    remMin: number;
    awakeMin: number;
  } | null;
  updatedAt: number;
}

/**
 * Expense / billing record. Storage for the 账单 room — separate from
 * conversations so it can have its own schema and listing semantics.
 */
export type ExpenseCategory =
  | '餐饮'
  | '交通'
  | '购物'
  | '日用'
  | '娱乐'
  | '医疗';

export type IncomeCategory = '工资' | '红包' | '退款' | '兼职' | '其他';

export type BillCategory = ExpenseCategory | IncomeCategory;

export type BillKind = 'expense' | 'income';

export interface Bill {
  id: string;
  /** Date string formatted MM/DD for grouping (year derived from createdAt). */
  date: string;
  /** What was bought / what the spend was for. */
  item: string;
  /** Amount in user's local currency (treat as ¥). */
  amount: number;
  category: BillCategory;
  /** Expense vs income. Defaults to 'expense' for legacy rows that lack it. */
  kind?: BillKind;
  /** Whether this was auto-detected from somewhere or hand-entered. */
  source: 'auto' | 'manual';
  createdAt: number;
}

/** Categories used by the extractor; rendered as colored chips in the UI. */
export type FactCategory =
  | 'user_fact'
  | 'preference'
  | 'relationship'
  | 'event'
  | 'context'
  | 'other';

export interface MemoryFact {
  id: string;
  /** Memory pool: facts are scoped per persona so 理理酱 and Rhema酱 don't bleed. */
  personaId: string;
  /** Origin conversation. */
  conversationId: string;
  /** Origin assistant message that triggered this extraction. */
  messageId: string;
  /** The fact itself, written in the same person/voice as the persona. */
  text: string;
  category: FactCategory;
  /** L2-normalized embedding vector. Stored as plain number[] for portability. */
  embedding: number[];
  /** Identifier of the embedding model used (for compat checks during retrieval). */
  embeddingModel: string;
  /** Pinned facts are always retrieved regardless of similarity. */
  pinned?: boolean;
  /** Archived facts are hidden from retrieval but kept. */
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}
