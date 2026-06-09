import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { db } from '../db';
import { newId } from '../lib/id';
import BillSniffer from '../lib/native/bill-sniffer';
import type {
  Bill,
  BillCategory,
  BillKind,
  ExpenseCategory,
  IncomeCategory,
} from '../types';

/**
 * Billing — expense + income tracking. Bills are stored in their own
 * Dexie table. Currency assumed ¥ for display. Donut chart aggregates
 * the visible month's expenses by category; income shown as a separate
 * summary row above the donut.
 */

const expenseCats: Record<ExpenseCategory, string> = {
  餐饮: '#e8a060',
  交通: '#7baab8',
  购物: '#b08acc',
  日用: '#82b496',
  娱乐: '#d88898',
  医疗: '#6890b0',
};

const incomeCats: Record<IncomeCategory, string> = {
  工资: '#7ab896',
  红包: '#e89880',
  退款: '#7baab8',
  兼职: '#b08acc',
  其他: '#a090a8',
};

const INCOME_GREEN = '#5fa57e';

function billKind(b: Bill): BillKind {
  return b.kind ?? 'expense';
}

function catColor(b: Bill): string {
  if (billKind(b) === 'income') {
    return incomeCats[b.category as IncomeCategory] ?? INCOME_GREEN;
  }
  return expenseCats[b.category as ExpenseCategory] ?? '#aaa';
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#8a7090',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        fontFamily: "'Crimson Pro','Noto Serif SC',serif",
        fontStyle: 'italic',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M10 3L5 8L10 13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      玄関
    </button>
  );
}

function Donut({ data }: { data: Bill[] }) {
  const expenses = data.filter((d) => billKind(d) === 'expense');
  const tot: Record<string, number> = {};
  expenses.forEach((d) => {
    tot[d.category] = (tot[d.category] || 0) + d.amount;
  });
  const total = Object.values(tot).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(tot).sort((a, b) => b[1] - a[1]);
  const r = 34;
  const cx = 45;
  const cy = 45;
  const circ = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width="90" height="90" viewBox="0 0 90 90">
        {sorted.map(([c, v]) => {
          const d = total > 0 ? (circ * v) / total : 0;
          const g = circ - d;
          const el = (
            <circle
              key={c}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={expenseCats[c as ExpenseCategory] || '#aaa'}
              strokeWidth="8"
              strokeDasharray={`${d} ${g}`}
              strokeDashoffset={-off}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          off += d;
          return el;
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fill="#4a3550"
          fontSize="15"
          fontFamily="'JetBrains Mono',monospace"
          fontWeight="500"
        >
          ¥{total}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fill="#a090a8"
          fontSize="9"
        >
          本月支出
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {sorted.length === 0 && (
          <span style={{ fontSize: 12, color: '#a090a8' }}>本月还没记账喵</span>
        )}
        {sorted.map(([c, v]) => (
          <div
            key={c}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: expenseCats[c as ExpenseCategory],
              }}
            />
            <span style={{ color: '#6a5a70', minWidth: 28 }}>{c}</span>
            <span
              style={{
                color: '#a090a8',
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11,
              }}
            >
              ¥{v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BillingPage() {
  const navigate = useNavigate();
  const recs = useLiveQuery(
    () => db.bills.orderBy('createdAt').reverse().toArray(),
    [],
    [],
  );
  const [sheet, setSheet] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  // Auto-focus amount input on open — the input is the most common
  // "wait, where do I type?" stumble.
  useEffect(() => {
    if (!sheet) return;
    const t = setTimeout(() => amountRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [sheet]);
  const [ni, setNi] = useState<{
    a: string;
    i: string;
    c: BillCategory;
    k: BillKind;
  }>({ a: '', i: '', c: '餐饮', k: 'expense' });

  // Bill-sniffer banner: on Android, prompt to enable the notification
  // listener so 支付宝 / 微信支付 通知 auto-feed the bills table. Hidden on web.
  const [snifferEnabled, setSnifferEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await BillSniffer.isEnabled();
        if (!cancelled) setSnifferEnabled(r.enabled);
      } catch {
        // ignore
      }
    })();
    // Re-poll when the page regains focus — the user comes back from the
    // system settings page after toggling the switch.
    function refocus() {
      void BillSniffer.isEnabled()
        .then((r) => {
          if (!cancelled) setSnifferEnabled(r.enabled);
        })
        .catch(() => {});
    }
    window.addEventListener('focus', refocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refocus);
    };
  }, []);

  // Group by date string
  const grouped: Record<string, Bill[]> = {};
  (recs ?? []).forEach((r) => {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push(r);
  });
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Month totals for the header summary row.
  const totals = (recs ?? []).reduce(
    (acc, r) => {
      if (billKind(r) === 'income') acc.income += r.amount;
      else acc.expense += r.amount;
      return acc;
    },
    { income: 0, expense: 0 },
  );
  const net = totals.income - totals.expense;

  const amountNum = parseFloat(ni.a);
  const canSave = Number.isFinite(amountNum) && amountNum > 0;

  async function add() {
    if (!canSave) return;
    const today = new Date();
    const ds = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    // Item is optional now — fall back to category label so the row
    // still has a recognizable name when she's just tapping in a quick
    // amount.
    const item = ni.i.trim() || ni.c;
    await db.bills.add({
      id: newId(),
      date: ds,
      item,
      amount: amountNum,
      category: ni.c,
      kind: ni.k,
      source: 'manual',
      createdAt: Date.now(),
    });
    setNi({ a: '', i: '', c: ni.k === 'income' ? '工资' : '餐饮', k: ni.k });
    setSheet(false);
  }

  function switchKind(k: BillKind) {
    setNi((p) => ({
      ...p,
      k,
      c: k === 'income' ? '工资' : '餐饮',
    }));
  }

  const sheetCats: BillCategory[] =
    ni.k === 'income'
      ? (Object.keys(incomeCats) as IncomeCategory[])
      : (Object.keys(expenseCats) as ExpenseCategory[]);
  const sheetColors: Record<string, string> =
    ni.k === 'income' ? incomeCats : expenseCats;

  async function deleteBill(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('删掉这一笔？')) return;
    await db.bills.delete(id);
  }

  const monthLabel = (() => {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月`;
  })();

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        position: 'relative',
        background: 'var(--page)',
        fontFamily: "-apple-system,'PingFang SC',sans-serif",
      }}
    >
      {/* Header */}
      <div
        className="topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 12px',
        }}
      >
        <BackButton onClick={() => navigate('/home')} />
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 18,
            color: 'var(--head)',
            letterSpacing: 1,
          }}
        >
          账单
        </div>
        <div style={{ width: 48 }} />
      </div>

      {snifferEnabled === false && (
        <div
          style={{
            margin: '8px 16px 0',
            padding: '10px 14px',
            background: 'rgba(232,196,104,0.15)',
            border: '1px solid rgba(232,196,104,0.3)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
            color: '#6b4f1d',
            lineHeight: 1.5,
          }}
        >
          <span style={{ flex: 1 }}>
            打开「通知使用权 → Wisteria」之后，
            支付宝 / 微信付款会自动入账。
          </span>
          <button
            type="button"
            onClick={() => void BillSniffer.openSettings().catch(() => {})}
            style={{
              flexShrink: 0,
              background: '#b08344',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            去开启
          </button>
        </div>
      )}

      {/* Month label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: '20px 0 16px',
        }}
      >
        <span style={{ fontSize: 14, color: '#5a4060', letterSpacing: 1 }}>
          {monthLabel}
        </span>
      </div>

      {/* Summary row: 支 / 收 / 净 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 28,
          padding: '0 24px 16px',
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        <SummaryStat label="支" value={totals.expense} color="#b08acc" />
        <SummaryStat label="收" value={totals.income} color={INCOME_GREEN} />
        <SummaryStat
          label="净"
          value={net}
          color={net >= 0 ? INCOME_GREEN : '#c45858'}
          signed
        />
      </div>

      {/* Donut */}
      <div style={{ padding: '0 24px 20px', display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(157,110,189,0.06)',
            borderRadius: 20,
            padding: '20px 24px',
          }}
        >
          <Donut data={recs ?? []} />
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '0 16px 100px' }}>
        {dates.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#a090a8',
              fontSize: 13,
            }}
          >
            还没有账目喵。点右下角 + 记一笔。
          </div>
        )}
        {dates.map((d) => (
          <div key={d} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                color: '#a090a8',
                fontWeight: 300,
                marginBottom: 8,
                paddingLeft: 4,
              }}
            >
              {d}
            </div>
            {grouped[d].map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  marginBottom: 4,
                  background: 'rgba(255,255,255,0.45)',
                  backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(157,110,189,0.04)',
                  borderRadius: 14,
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 28,
                    borderRadius: 2,
                    background: catColor(r),
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      color: '#3a2840',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.item}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#b0a0b8',
                      marginTop: 1,
                      display: 'flex',
                      gap: 4,
                    }}
                  >
                    <span>{r.category}</span>
                    {r.source === 'auto' && (
                      <span
                        style={{
                          fontSize: 9,
                          color: '#c0b0c8',
                          background: 'rgba(176,138,204,0.1)',
                          padding: '0 4px',
                          borderRadius: 4,
                        }}
                      >
                        自动
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 15,
                    color: billKind(r) === 'income' ? INCOME_GREEN : '#4a3550',
                    fontWeight: 500,
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {billKind(r) === 'income' ? '+' : ''}¥{r.amount}
                </div>
                <button
                  onClick={(e) => deleteBill(r.id, e)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#c0b0c8',
                    fontSize: 14,
                    padding: 4,
                  }}
                  aria-label="删除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => setSheet(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: 'linear-gradient(135deg,#b08acc,#9068b8)',
          boxShadow: '0 4px 16px rgba(157,110,189,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 4V16M4 10H16"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Sheet overlay */}
      {sheet && (
        <div
          onClick={() => setSheet(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(40,20,50,0.3)',
            backdropFilter: 'blur(3px)',
            zIndex: 30,
          }}
        />
      )}

      {/* Sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px 24px 0 0',
          border: '1px solid rgba(157,110,189,0.08)',
          padding: '20px 24px 32px',
          transform: `translateY(${sheet ? 0 : 100}%)`,
          transition: 'transform .35s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 3,
            borderRadius: 2,
            background: 'rgba(157,110,189,0.2)',
            margin: '0 auto 20px',
          }}
        />
        <div
          style={{
            fontSize: 14,
            color: '#4a3550',
            fontWeight: 500,
            marginBottom: 14,
            textAlign: 'center',
          }}
        >
          记一笔
        </div>
        {/* Kind toggle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 16,
          }}
        >
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => switchKind(k)}
              style={{
                padding: '6px 18px',
                borderRadius: 18,
                fontSize: 13,
                border: '1.5px solid',
                borderColor:
                  ni.k === k
                    ? k === 'income'
                      ? INCOME_GREEN
                      : '#b08acc'
                    : 'rgba(157,110,189,0.12)',
                background:
                  ni.k === k
                    ? k === 'income'
                      ? `${INCOME_GREEN}18`
                      : 'rgba(176,138,204,0.12)'
                    : 'transparent',
                color:
                  ni.k === k
                    ? k === 'income'
                      ? INCOME_GREEN
                      : '#7050a0'
                    : '#8a7090',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all .15s',
              }}
            >
              {k === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 18, color: '#8a7090' }}>¥</span>
          <input
            ref={amountRef}
            value={ni.a}
            onChange={(e) => setNi((p) => ({ ...p, a: e.target.value }))}
            placeholder="0"
            type="number"
            inputMode="decimal"
            style={{
              fontSize: 36,
              fontFamily: "'JetBrains Mono',monospace",
              fontWeight: 500,
              color: '#3a2840',
              background: 'transparent',
              border: 'none',
              borderBottom: '1.5px solid rgba(157,110,189,0.25)',
              outline: 'none',
              width: 140,
              textAlign: 'center',
              padding: '4px 8px',
            }}
          />
        </div>
        <input
          value={ni.i}
          onChange={(e) => setNi((p) => ({ ...p, i: e.target.value }))}
          placeholder={ni.k === 'income' ? '备注（可空）' : '买了什么（可空）'}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: 14,
            color: '#3a2840',
            background: 'rgba(245,238,248,0.6)',
            border: '1px solid rgba(157,110,189,0.1)',
            borderRadius: 12,
            outline: 'none',
            marginBottom: 16,
            fontFamily: 'inherit',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 20,
          }}
        >
          {sheetCats.map((c) => {
            const tone = sheetColors[c];
            const on = ni.c === c;
            return (
              <button
                key={c}
                onClick={() => setNi((p) => ({ ...p, c }))}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  border: `1.5px solid ${on ? tone : 'rgba(157,110,189,0.12)'}`,
                  background: on ? `${tone}18` : 'transparent',
                  color: on ? tone : '#8a7090',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => void add()}
          disabled={!canSave}
          style={{
            width: '100%',
            padding: '12px 0',
            borderRadius: 14,
            border: 'none',
            background: canSave
              ? ni.k === 'income'
                ? `linear-gradient(135deg,${INCOME_GREEN},#4a8a68)`
                : 'linear-gradient(135deg,#b08acc,#9068b8)'
              : 'rgba(176,138,204,0.15)',
            color: canSave ? '#fff' : '#b0a0b8',
            fontSize: 14,
            fontWeight: 500,
            cursor: canSave ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  color,
  signed,
}: {
  label: string;
  value: number;
  color: string;
  signed?: boolean;
}) {
  const sign = signed ? (value >= 0 ? '+' : '-') : '';
  const display = Math.abs(value);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 10, color: '#a090a8', letterSpacing: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 15, color, fontWeight: 500 }}>
        {sign}¥{display}
      </span>
    </div>
  );
}
