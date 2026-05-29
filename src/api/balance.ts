import type { Endpoint } from '../types';

/**
 * Provider balance/quota query. Each provider exposes this differently —
 * there's no standard. We detect by baseUrl host and dispatch to a
 * known handler. Unknown providers return { supported: false }.
 *
 * Result is best-effort. `available` is the spendable amount; `currency`
 * is the unit (typically USD or CNY); `raw` is the parsed response in
 * case the caller wants to surface more detail.
 */

export interface BalanceResult {
  supported: true;
  /** Spendable amount (positive). */
  available: number;
  /** Currency code: 'USD' | 'CNY' | etc. */
  currency: string;
  /** Total granted/cap if the provider exposes it. */
  total?: number;
  /** Used to date if exposed. */
  used?: number;
  /** Provider label for display ("AIHubMix", "SiliconFlow", ...). */
  provider: string;
  /** Original response for power-user inspection. */
  raw: unknown;
}

export interface BalanceUnsupported {
  supported: false;
  reason: string;
}

export type BalanceQueryResult = BalanceResult | BalanceUnsupported;

interface Handler {
  /** Match against the endpoint's baseUrl host. */
  match: (host: string) => boolean;
  label: string;
  fetch: (endpoint: Endpoint) => Promise<BalanceResult>;
}

const HANDLERS: Handler[] = [
  {
    label: 'AIHubMix',
    match: (h) => h.endsWith('aihubmix.com'),
    fetch: aihubmix,
  },
  {
    label: 'SiliconFlow',
    match: (h) => h.endsWith('siliconflow.cn') || h.endsWith('siliconflow.com'),
    fetch: siliconflow,
  },
  {
    label: 'DeepSeek',
    match: (h) => h.endsWith('deepseek.com'),
    fetch: deepseek,
  },
  {
    label: 'OpenRouter',
    match: (h) => h.endsWith('openrouter.ai'),
    fetch: openrouter,
  },
  {
    label: 'Moonshot',
    match: (h) => h.endsWith('moonshot.cn') || h.endsWith('moonshot.ai'),
    fetch: moonshot,
  },
];

export async function fetchBalance(endpoint: Endpoint): Promise<BalanceQueryResult> {
  let host = '';
  try {
    host = new URL(endpoint.baseUrl).hostname.toLowerCase();
  } catch {
    return { supported: false, reason: 'baseUrl 不是有效 URL' };
  }
  const handler = HANDLERS.find((h) => h.match(host));
  if (!handler) {
    return { supported: false, reason: `${host} 暂未接入余额查询` };
  }
  return handler.fetch(endpoint);
}

// ─── Provider handlers ──────────────────────────────────────────────────

function authHeader(endpoint: Endpoint): Record<string, string> {
  if (endpoint.authStyle === 'x-api-key') {
    return { 'x-api-key': endpoint.apiKey };
  }
  return { Authorization: `Bearer ${endpoint.apiKey}` };
}

async function jsonGet(url: string, endpoint: Endpoint): Promise<unknown> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...authHeader(endpoint) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

/** AIHubMix uses the OpenAI legacy /dashboard/billing/credit_grants shape. */
async function aihubmix(endpoint: Endpoint): Promise<BalanceResult> {
  const root = endpoint.baseUrl.replace(/\/+$/, '');
  // baseUrl is usually https://aihubmix.com/v1, strip to host.
  const base = root.replace(/\/v1$/, '');
  const data = (await jsonGet(`${base}/v1/dashboard/billing/credit_grants`, endpoint)) as {
    total_granted?: number;
    total_used?: number;
    total_available?: number;
  };
  return {
    supported: true,
    provider: 'AIHubMix',
    currency: 'USD',
    available: Number(data.total_available ?? 0),
    total: data.total_granted !== undefined ? Number(data.total_granted) : undefined,
    used: data.total_used !== undefined ? Number(data.total_used) : undefined,
    raw: data,
  };
}

async function siliconflow(endpoint: Endpoint): Promise<BalanceResult> {
  const root = endpoint.baseUrl.replace(/\/+$/, '');
  const base = root.replace(/\/v1$/, '');
  const data = (await jsonGet(`${base}/v1/user/info`, endpoint)) as {
    data?: {
      balance?: string;
      chargeBalance?: string;
      totalBalance?: string;
    };
  };
  const u = data.data ?? {};
  // totalBalance = chargeBalance (paid) + balance (gifted credit)
  const total = u.totalBalance !== undefined ? Number(u.totalBalance) : undefined;
  const available = total ?? Number(u.balance ?? 0) + Number(u.chargeBalance ?? 0);
  return {
    supported: true,
    provider: 'SiliconFlow',
    currency: 'CNY',
    available,
    total,
    raw: data,
  };
}

async function deepseek(endpoint: Endpoint): Promise<BalanceResult> {
  const root = endpoint.baseUrl.replace(/\/+$/, '');
  // DeepSeek's /user/balance lives at the root, not /v1.
  const base = root.replace(/\/v1$/, '');
  const data = (await jsonGet(`${base}/user/balance`, endpoint)) as {
    is_available?: boolean;
    balance_infos?: Array<{
      currency?: string;
      total_balance?: string;
      granted_balance?: string;
      topped_up_balance?: string;
    }>;
  };
  // Prefer CNY, then USD, then first.
  const infos = data.balance_infos ?? [];
  const pick =
    infos.find((b) => b.currency === 'CNY') ??
    infos.find((b) => b.currency === 'USD') ??
    infos[0];
  return {
    supported: true,
    provider: 'DeepSeek',
    currency: pick?.currency ?? 'CNY',
    available: Number(pick?.total_balance ?? 0),
    raw: data,
  };
}

async function openrouter(endpoint: Endpoint): Promise<BalanceResult> {
  const root = endpoint.baseUrl.replace(/\/+$/, '');
  // baseUrl is usually https://openrouter.ai/api/v1.
  const base = root.replace(/\/api\/v1$/, '').replace(/\/v1$/, '');
  const data = (await jsonGet(`${base}/api/v1/auth/key`, endpoint)) as {
    data?: {
      label?: string;
      usage?: number;
      limit?: number | null;
      limit_remaining?: number | null;
    };
  };
  const d = data.data ?? {};
  return {
    supported: true,
    provider: 'OpenRouter',
    currency: 'USD',
    available:
      d.limit_remaining !== null && d.limit_remaining !== undefined
        ? Number(d.limit_remaining)
        : 0,
    total: d.limit !== null && d.limit !== undefined ? Number(d.limit) : undefined,
    used: d.usage !== undefined ? Number(d.usage) : undefined,
    raw: data,
  };
}

async function moonshot(endpoint: Endpoint): Promise<BalanceResult> {
  const root = endpoint.baseUrl.replace(/\/+$/, '');
  const base = root.replace(/\/v1$/, '');
  const data = (await jsonGet(`${base}/v1/users/me/balance`, endpoint)) as {
    code?: number;
    data?: {
      available_balance?: number;
      voucher_balance?: number;
      cash_balance?: number;
    };
  };
  const d = data.data ?? {};
  return {
    supported: true,
    provider: 'Moonshot',
    currency: 'CNY',
    available: Number(d.available_balance ?? 0),
    raw: data,
  };
}
