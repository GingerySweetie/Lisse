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
  createdAt: number;
  updatedAt: number;
}

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  id: string;
  conversationId: string;
  /** parent message id; null for root. Enables ChatGPT-style branch tree. */
  parentId: string | null;
  role: Role;
  content: string;
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
  /** if imported from ChatGPT, original conversation id. */
  sourceId?: string;
  source?: 'native' | 'chatgpt' | 'claude';
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  /** Selected endpoint+model used when creating new conversations. */
  defaultEndpointId: string | null;
  defaultModel: string | null;
  /** Selected persona used when creating new conversations. */
  defaultPersonaId: string | null;
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
