import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, ChevronLeft, Brain } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, getSettings, saveSettings } from '../db';
import type { Endpoint, EndpointFormat } from '../types';
import { newId } from '../lib/id';
import { streamChat } from '../api';
import { embed } from '../api/embedding';

export default function SettingsPage() {
  const endpoints = useLiveQuery(
    () => db.endpoints.orderBy('createdAt').toArray(),
    [],
    [],
  );
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-3 border-b border-lavender-200 bg-white/60 px-3 py-3 pl-14 backdrop-blur md:px-6 md:pl-6">
        <Link
          to="/chat"
          className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50 md:inline-flex"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="serif-title text-lg">设置 · Endpoints</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink-500">
              添加 OpenAI 兼容或 Anthropic 原生格式的 endpoint。<br />
              所有数据只存在浏览器本地。
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg bg-lavender-200 px-3 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
            >
              <Plus size={16} />
              添加
            </button>
          </div>

          {endpoints && endpoints.length === 0 && !creating && (
            <EmptyState onCreate={() => setCreating(true)} />
          )}

          <ul className="flex flex-col gap-3">
            {endpoints?.map((ep) => (
              <li key={ep.id}>
                <EndpointCard
                  endpoint={ep}
                  onEdit={() => setEditing(ep)}
                />
              </li>
            ))}
          </ul>

          {(creating || editing) && (
            <EndpointEditor
              endpoint={editing}
              onClose={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          )}

          <MemorySettings />
        </div>
      </div>
    </div>
  );
}

function MemorySettings() {
  const settings = useLiveQuery(() => getSettings(), [], null);
  const endpoints = useLiveQuery(() => db.endpoints.toArray(), [], []);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');

  const openaiEndpoints = endpoints?.filter((e) => e.format === 'openai') ?? [];

  if (!settings) return null;
  const s = settings;

  async function update(patch: Parameters<typeof saveSettings>[0]) {
    await saveSettings(patch);
  }

  const embeddingEp = openaiEndpoints.find(
    (e) => e.id === s.embeddingEndpointId,
  );
  const extractorEp = endpoints?.find((e) => e.id === s.extractorEndpointId);

  async function testEmbedding() {
    if (!s.embeddingEndpointId || !s.embeddingModel) return;
    const ep = await db.endpoints.get(s.embeddingEndpointId);
    if (!ep) return;
    setTesting(true);
    setTestStatus('idle');
    try {
      const r = await embed({
        endpoint: ep,
        model: s.embeddingModel,
        inputs: ['hello'],
      });
      setTestStatus('ok');
      setTestMsg(
        `维度 ${r.vectors[0]?.length ?? '?'}, model=${r.model}${
          r.tokens ? `, tokens=${r.tokens}` : ''
        }`,
      );
    } catch (err) {
      setTestStatus('fail');
      setTestMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-lavender-200 bg-white/55 p-5 shadow-sm backdrop-blur-sm">
      <h3 className="flex items-center gap-2 text-base font-semibold text-ink-900">
        <Brain size={18} className="text-lavender-600" />
        记忆系统
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        开启后，每轮对话结束会自动从对话里抽取事实，存进对应人格的记忆池。
        下一轮对话发起时，按当前问题做向量检索，把 top-K 相关事实注入 system prompt。
      </p>

      <label className="mt-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={s.memoryEnabled}
          onChange={(e) => update({ memoryEnabled: e.target.checked })}
          className="h-4 w-4 accent-lavender-400"
        />
        <span className="text-sm text-ink-900">启用记忆系统</span>
      </label>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink-500">
            嵌入 endpoint（OpenAI 兼容）
          </span>
          <select
            value={s.embeddingEndpointId ?? ''}
            onChange={(e) =>
              update({
                embeddingEndpointId: e.target.value || null,
                embeddingModel: null,
              })
            }
            className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
          >
            <option value="">未选择</option>
            {openaiEndpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink-500">嵌入模型</span>
          <select
            value={s.embeddingModel ?? ''}
            onChange={(e) => update({ embeddingModel: e.target.value || null })}
            disabled={!embeddingEp}
            className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300 disabled:opacity-50"
          >
            <option value="">未选择</option>
            {embeddingEp?.embeddingModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink-500">
            事实抽取 endpoint（任意聊天 endpoint）
          </span>
          <select
            value={s.extractorEndpointId ?? ''}
            onChange={(e) =>
              update({
                extractorEndpointId: e.target.value || null,
                extractorModel: null,
              })
            }
            className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
          >
            <option value="">未选择</option>
            {endpoints?.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink-500">
            抽取模型（建议用便宜的小模型）
          </span>
          <select
            value={s.extractorModel ?? ''}
            onChange={(e) => update({ extractorModel: e.target.value || null })}
            disabled={!extractorEp}
            className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300 disabled:opacity-50"
          >
            <option value="">未选择</option>
            {extractorEp?.chatModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink-500">
            检索 top-K（每次注入多少条）
          </span>
          <input
            type="number"
            min={1}
            max={50}
            value={s.retrievalTopK}
            onChange={(e) =>
              update({ retrievalTopK: Math.max(1, Number(e.target.value) || 6) })
            }
            className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink-500">
            相似度阈值（0..1，越高越严）
          </span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={s.retrievalThreshold}
            onChange={(e) =>
              update({
                retrievalThreshold: Math.max(0, Math.min(1, Number(e.target.value) || 0.5)),
              })
            }
            className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="text-xs font-medium text-ink-500">
            短记忆模式（每轮最多带几对最近消息，0 / 留空 = 不限）
          </span>
          <input
            type="number"
            min={0}
            max={200}
            value={s.maxHistoryTurns ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              update({
                maxHistoryTurns:
                  v === '' || Number(v) === 0 ? null : Math.max(1, Number(v)),
              });
            }}
            placeholder="不限"
            className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
          />
          <span className="text-[11px] font-light text-ink-500">
            长对话不再每轮重发整段历史。配合 Anthropic 的 prompt caching 用，账单会很温柔。
          </span>
        </label>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={testEmbedding}
          disabled={
            testing ||
            !s.embeddingEndpointId ||
            !s.embeddingModel
          }
          className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-500 transition hover:bg-sky-100 disabled:opacity-60"
        >
          {testing ? '测试中…' : '测试嵌入'}
        </button>
        {testStatus === 'ok' && (
          <div className="mt-2 flex items-start gap-1 break-words text-xs text-sky-500">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{testMsg}</span>
          </div>
        )}
        {testStatus === 'fail' && (
          <div className="mt-2 flex items-start gap-1 break-words text-xs text-rose-500">
            <XCircle size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{testMsg}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-lavender-300 bg-white/50 p-8 text-center">
      <p className="text-ink-700">
        还没有 endpoint 喵。<br />
        点上面的"添加"或下面这个按钮开始：
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
      >
        添加 endpoint
      </button>
    </div>
  );
}

function EndpointCard({
  endpoint,
  onEdit,
}: {
  endpoint: Endpoint;
  onEdit: () => void;
}) {
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'ok' | 'fail'
  >('idle');
  const [testMsg, setTestMsg] = useState<string>('');

  async function handleDelete() {
    if (!confirm(`删除 endpoint "${endpoint.name}"？`)) return;
    await db.endpoints.delete(endpoint.id);
  }

  async function handleTest() {
    setTestStatus('testing');
    setTestMsg('');
    const model = endpoint.chatModels[0];
    if (!model) {
      setTestStatus('fail');
      setTestMsg('没有配置模型');
      return;
    }
    try {
      let acc = '';
      let errored = false;
      let errorMessage = '';
      for await (const evt of streamChat({
        endpoint,
        model,
        messages: [{ role: 'user', content: 'Hi (one short word)' }],
        maxTokens: 16,
      })) {
        if (evt.type === 'delta' && evt.delta) acc += evt.delta;
        else if (evt.type === 'error') {
          errored = true;
          errorMessage = evt.errorMessage ?? '';
          break;
        }
      }
      if (errored) {
        setTestStatus('fail');
        setTestMsg(errorMessage || '未知错误');
      } else if (!acc.trim()) {
        setTestStatus('fail');
        setTestMsg('返回为空');
      } else {
        setTestStatus('ok');
        setTestMsg(`回复：${acc.slice(0, 80)}`);
      }
    } catch (err) {
      setTestStatus('fail');
      setTestMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="rounded-2xl border border-lavender-200 bg-white/55 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink-900">
              {endpoint.name}
            </h3>
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
                endpoint.format === 'anthropic'
                  ? 'bg-lavender-100 text-lavender-600'
                  : 'bg-sky-100 text-sky-500'
              }`}
            >
              {endpoint.format}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-ink-500">
            {endpoint.baseUrl}
          </div>
          {endpoint.chatModels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {endpoint.chatModels.map((m) => (
                <span
                  key={m}
                  className="rounded bg-lavender-50 px-1.5 py-0.5 text-xs text-ink-700"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-lavender-50 hover:text-ink-900"
            aria-label="编辑"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-rose-50 hover:text-rose-500"
            aria-label="删除"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testStatus === 'testing'}
          className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-500 transition hover:bg-sky-100 disabled:opacity-60"
        >
          {testStatus === 'testing' ? '测试中…' : '测试连接'}
        </button>
        {testStatus === 'ok' && (
          <div className="mt-2 flex items-start gap-1 break-words text-xs text-sky-500">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{testMsg}</span>
          </div>
        )}
        {testStatus === 'fail' && (
          <div className="mt-2 flex items-start gap-1 break-words text-xs text-rose-500">
            <XCircle size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{testMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface EditorProps {
  endpoint: Endpoint | null;
  onClose: () => void;
}

const PRESETS: Record<string, Partial<Endpoint>> = {
  // ─── 中转 / 聚合（支持国内支付）────────────────────────
  'AIHubMix · 主力（一条模型）': {
    baseUrl: 'https://aihubmix.com/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['gpt-4o-2024-11-20'],
    embeddingModels: [],
  },
  'AIHubMix · 抽取小模型': {
    baseUrl: 'https://aihubmix.com/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['gpt-4o-mini', 'claude-3-5-haiku-latest', 'deepseek-chat'],
    embeddingModels: ['text-embedding-3-small'],
  },
  'AIHubMix (Anthropic 格式)': {
    baseUrl: 'https://aihubmix.com/v1',
    format: 'anthropic',
    authStyle: 'x-api-key',
    chatModels: ['claude-sonnet-4-5', 'claude-opus-4-5'],
    embeddingModels: [],
  },
  'OpenRouter（聚合，多家模型）': {
    baseUrl: 'https://openrouter.ai/api/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: [
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-4o-2024-11-20',
      'google/gemini-2.0-flash-exp',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    embeddingModels: [],
  },
  'SiliconFlow（国内，bge-m3 友好）': {
    baseUrl: 'https://api.siliconflow.cn/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: [
      'deepseek-ai/DeepSeek-V3',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/QwQ-32B',
    ],
    embeddingModels: ['BAAI/bge-m3', 'BAAI/bge-large-zh-v1.5'],
  },

  // ─── 国内官方（多数支持支付宝/微信）──────────────────
  'DeepSeek 官方': {
    baseUrl: 'https://api.deepseek.com/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['deepseek-chat', 'deepseek-reasoner'],
    embeddingModels: [],
  },
  '智谱 GLM (BigModel)': {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['glm-4-plus', 'glm-4-flash', 'glm-zero-preview'],
    embeddingModels: ['embedding-3'],
  },
  'Moonshot Kimi': {
    baseUrl: 'https://api.moonshot.cn/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: [
      'kimi-k2-0905-preview',
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
    ],
    embeddingModels: [],
  },
  '通义千问 (DashScope)': {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwq-32b-preview'],
    embeddingModels: ['text-embedding-v3'],
  },
  '零一万物 Yi': {
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['yi-large', 'yi-medium', 'yi-vision-v2'],
    embeddingModels: [],
  },
  '阶跃 StepFun': {
    baseUrl: 'https://api.stepfun.com/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['step-2-16k', 'step-1-32k', 'step-1-flash'],
    embeddingModels: [],
  },
  'MiniMax': {
    baseUrl: 'https://api.minimaxi.com/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['MiniMax-Text-01', 'abab6.5s-chat'],
    embeddingModels: ['embo-01'],
  },

  // ─── 海外官方 ──────────────────────────────────────────
  'Anthropic 官方': {
    baseUrl: 'https://api.anthropic.com/v1',
    format: 'anthropic',
    authStyle: 'x-api-key',
    chatModels: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
    embeddingModels: [],
  },
  'OpenAI 官方': {
    baseUrl: 'https://api.openai.com/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['gpt-4o-2024-11-20', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3-mini'],
    embeddingModels: ['text-embedding-3-small', 'text-embedding-3-large'],
  },
  'Groq（极速推理）': {
    baseUrl: 'https://api.groq.com/openai/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: [
      'llama-3.3-70b-versatile',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    embeddingModels: [],
  },
  'Together AI': {
    baseUrl: 'https://api.together.xyz/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: [
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'deepseek-ai/DeepSeek-V3',
    ],
    embeddingModels: [],
  },
  'xAI Grok': {
    baseUrl: 'https://api.x.ai/v1',
    format: 'openai',
    authStyle: 'bearer',
    chatModels: ['grok-2-latest', 'grok-2-1212', 'grok-beta'],
    embeddingModels: [],
  },
};

function EndpointEditor({ endpoint, onClose }: EditorProps) {
  const [name, setName] = useState(endpoint?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(endpoint?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(endpoint?.apiKey ?? '');
  const [format, setFormat] = useState<EndpointFormat>(
    endpoint?.format ?? 'openai',
  );
  const [authStyle, setAuthStyle] = useState<'bearer' | 'x-api-key'>(
    endpoint?.authStyle ?? 'bearer',
  );
  const [chatModelsText, setChatModelsText] = useState(
    endpoint?.chatModels.join('\n') ?? '',
  );
  const [embeddingModelsText, setEmbeddingModelsText] = useState(
    endpoint?.embeddingModels.join('\n') ?? '',
  );
  const [thinkingEnabled, setThinkingEnabled] = useState(
    endpoint?.thinkingEnabled ?? false,
  );
  const [thinkingBudget, setThinkingBudget] = useState(
    endpoint?.thinkingBudget ?? 6000,
  );
  const [cacheLongTTL, setCacheLongTTL] = useState(
    endpoint?.cacheLongTTL ?? false,
  );

  function applyPreset(presetName: string) {
    const p = PRESETS[presetName];
    if (!p) return;
    if (!name) setName(presetName);
    if (p.baseUrl) setBaseUrl(p.baseUrl);
    if (p.format) setFormat(p.format);
    if (p.authStyle) setAuthStyle(p.authStyle);
    if (p.chatModels) setChatModelsText(p.chatModels.join('\n'));
    if (p.embeddingModels) setEmbeddingModelsText(p.embeddingModels.join('\n'));
  }

  async function handleSave() {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      alert('名字、Base URL、API Key 都不能空');
      return;
    }
    const now = Date.now();
    const data: Endpoint = {
      id: endpoint?.id ?? newId(),
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      format,
      authStyle,
      chatModels: parseList(chatModelsText),
      embeddingModels: parseList(embeddingModelsText),
      thinkingEnabled: format === 'anthropic' ? thinkingEnabled : undefined,
      thinkingBudget: format === 'anthropic' ? thinkingBudget : undefined,
      cacheLongTTL: format === 'anthropic' ? cacheLongTTL : undefined,
      createdAt: endpoint?.createdAt ?? now,
      updatedAt: now,
    };
    await db.endpoints.put(data);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white/95 p-5 shadow-xl backdrop-blur-md md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-ink-900">
          {endpoint ? '编辑 endpoint' : '添加 endpoint'}
        </h3>

        {!endpoint && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-ink-500">
              快速套用
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(PRESETS).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-lg border border-lavender-200 bg-lavender-50 px-2 py-1 text-xs text-ink-700 transition hover:bg-lavender-100"
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] font-light leading-relaxed text-ink-500">
              小提示：一条 endpoint 下所有模型共用同一个 key。
              如果担心选错模型，建议把"聊天主力"和"抽取小模型"分成两条 endpoint
              （它们可以共用同一把 key，只是模型列表不同）。
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <Field label="名字">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="比如：AIHubMix (Claude)"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
            />
          </Field>

          <Field label="Base URL">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://aihubmix.com/v1"
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
            />
          </Field>

          <Field label="API Key">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
            />
          </Field>

          <div className="flex gap-3">
            <Field label="格式" className="flex-1">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as EndpointFormat)}
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="anthropic">Anthropic 原生</option>
              </select>
            </Field>
            <Field label="认证方式" className="flex-1">
              <select
                value={authStyle}
                onChange={(e) =>
                  setAuthStyle(e.target.value as 'bearer' | 'x-api-key')
                }
                className="rounded-lg border border-lavender-200 bg-white px-3 py-2 focus:border-lavender-300"
              >
                <option value="bearer">Authorization: Bearer</option>
                <option value="x-api-key">x-api-key</option>
              </select>
            </Field>
          </div>

          <Field label="Chat 模型（每行一个）">
            <textarea
              value={chatModelsText}
              onChange={(e) => setChatModelsText(e.target.value)}
              placeholder="claude-sonnet-4-5&#10;gpt-4o-mini"
              rows={3}
              className="resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
            />
          </Field>

          <Field label="Embedding 模型（可空）">
            <textarea
              value={embeddingModelsText}
              onChange={(e) => setEmbeddingModelsText(e.target.value)}
              placeholder="text-embedding-3-small"
              rows={2}
              className="resize-y rounded-lg border border-lavender-200 bg-white px-3 py-2 font-mono text-xs focus:border-lavender-300"
            />
          </Field>

          {format === 'anthropic' && (
            <div className="rounded-lg border border-dashed border-lavender-200 bg-lavender-50/50 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={thinkingEnabled}
                  onChange={(e) => setThinkingEnabled(e.target.checked)}
                  className="h-4 w-4 accent-lavender-500"
                />
                <span className="text-ink-900">
                  启用 Extended Thinking
                </span>
              </label>
              <p className="mt-1 text-xs text-ink-500">
                Claude Sonnet 4.5+ / Opus 4.5+ 才支持。打开后模型回复前会先输出一段"内心独白"。
              </p>
              {thinkingEnabled && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-xs font-medium text-ink-500">
                    Thinking budget
                  </span>
                  <input
                    type="number"
                    min={1024}
                    max={32000}
                    step={1024}
                    value={thinkingBudget}
                    onChange={(e) =>
                      setThinkingBudget(
                        Math.max(1024, Number(e.target.value) || 6000),
                      )
                    }
                    className="w-28 rounded-lg border border-lavender-200 bg-white px-2 py-1 text-xs focus:border-lavender-300"
                  />
                  <span className="text-xs text-ink-500">tokens</span>
                </label>
              )}
            </div>
          )}

          {format === 'anthropic' && (
            <div className="rounded-lg border border-dashed border-lavender-200 bg-lavender-50/50 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cacheLongTTL}
                  onChange={(e) => setCacheLongTTL(e.target.checked)}
                  className="h-4 w-4 accent-lavender-500"
                />
                <span className="text-ink-900">
                  使用 1 小时缓存（适合慢节奏聊天）
                </span>
              </label>
              <p className="mt-1 text-xs text-ink-500">
                默认 5 分钟。开启后，缓存写入费用从 1.25x 升到 2x 普通 input，
                但读取仍是 10% —— 离开 10 分钟回来不用重写缓存。
                聊天频率每天数次、每次间隔较长（上班 / 排班期间）建议开。
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-lavender-200 px-4 py-2 text-sm text-ink-700 transition hover:bg-lavender-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-lavender-200 px-4 py-2 text-sm font-medium text-ink-900 transition hover:bg-lavender-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-xs font-medium text-ink-500">{label}</span>
      {children}
    </label>
  );
}

function parseList(text: string): string[] {
  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}
