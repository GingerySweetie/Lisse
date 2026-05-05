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
  /** Theme preference, future: 'light' | 'dark' | 'auto'. */
  theme: 'light';
}
