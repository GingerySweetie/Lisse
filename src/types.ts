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
  createdAt: number;
  updatedAt: number;
}

export type Role = 'system' | 'user' | 'assistant';

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
  /** Writing style applied to every assistant turn in this conversation. */
  styleId?: string;
  /** if imported from ChatGPT, original conversation id. */
  sourceId?: string;
  source?: 'native' | 'chatgpt' | 'claude';
  /** When set, this conversation is the discussion thread for a book. */
  bookId?: string;
  /** Special room marker — e.g. 'bedroom' for intimate per-persona threads.
   *  These conversations are hidden from the main conversation sidebar. */
  room?: 'bedroom';
  /** Per-conversation accent color (hex). Independent of persona — the user
   *  picks it after choosing who to talk to. Used for the user's own bubble
   *  and small UI accents. Falls back to the default sky tone when unset. */
  accentColor?: string;
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
  createdAt: number;
  updatedAt: number;
}

/**
 * Expense / billing record. Storage for the 账单 room — separate from
 * conversations so it can have its own schema and listing semantics.
 */
export type BillCategory =
  | '餐饮'
  | '交通'
  | '购物'
  | '日用'
  | '娱乐'
  | '医疗';

export interface Bill {
  id: string;
  /** Date string formatted MM/DD for grouping (year derived from createdAt). */
  date: string;
  /** What was bought / what the spend was for. */
  item: string;
  /** Amount in user's local currency (treat as ¥). */
  amount: number;
  category: BillCategory;
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
  /** Memory pool: facts are scoped per persona so 理理酱 and Rhema don't bleed. */
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
