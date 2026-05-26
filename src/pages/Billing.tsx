import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { newId } from '../lib/id';
import type { Bill, BillCategory } from '../types';

/**
 * Billing — expense tracking. Bills are stored in their own Dexie table.
 * Currency assumed ¥ for display. Donut chart aggregates the visible
 * month's spend by category.
 */

const cats: Record<BillCategory, string> = {
  餐饮: '#e8a060',
  交通: '#7baab8',
  购物: '#b08acc',
  日用: '#82b496',
  娱乐: '#d88898',
  医疗: '#6890b0',
};

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
  const tot: Record<string, number> = {};
  data.forEach((d) => {
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
              stroke={cats[c as BillCategory] || '#aaa'}
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
                background: cats[c as BillCategory],
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
  const [ni, setNi] = useState<{
    a: string;
    i: string;
    c: BillCategory;
  }>({ a: '', i: '', c: '餐饮' });

  // Group by date string
  const grouped: Record<string, Bill[]> = {};
  (recs ?? []).forEach((r) => {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push(r);
  });
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  async function add() {
    if (!ni.a || !ni.i) return;
    const today = new Date();
    const ds = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    await db.bills.add({
      id: newId(),
      date: ds,
      item: ni.i,
      amount: parseFloat(ni.a),
      category: ni.c,
      source: 'manual',
      createdAt: Date.now(),
    });
    setNi({ a: '', i: '', c: '餐饮' });
    setSheet(false);
  }

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
        fontFamily: "-apple-system,'PingFang SC',sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderBottom: '1px solid rgba(157,110,189,0.08)',
          background: 'rgba(245,238,248,0.85)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <BackButton onClick={() => navigate('/home')} />
        <div style={{ fontSize: 15, color: '#4a3550', fontWeight: 500, letterSpacing: 1 }}>
          账单
        </div>
        <div style={{ width: 48 }} />
      </div>

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
                    background: cats[r.category] || '#aaa',
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
                    color: '#4a3550',
                    fontWeight: 500,
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  ¥{r.amount}
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
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          记一笔
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 18, color: '#8a7090' }}>¥</span>
          <input
            value={ni.a}
            onChange={(e) => setNi((p) => ({ ...p, a: e.target.value }))}
            placeholder="0"
            type="number"
            style={{
              fontSize: 36,
              fontFamily: "'JetBrains Mono',monospace",
              fontWeight: 500,
              color: '#3a2840',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: 120,
              textAlign: 'center',
            }}
          />
        </div>
        <input
          value={ni.i}
          onChange={(e) => setNi((p) => ({ ...p, i: e.target.value }))}
          placeholder="买了什么"
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
          {(Object.keys(cats) as BillCategory[]).map((c) => (
            <button
              key={c}
              onClick={() => setNi((p) => ({ ...p, c }))}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 13,
                border: `1.5px solid ${ni.c === c ? cats[c] : 'rgba(157,110,189,0.12)'}`,
                background:
                  ni.c === c ? `${cats[c]}18` : 'transparent',
                color: ni.c === c ? cats[c] : '#8a7090',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all .15s',
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          onClick={() => void add()}
          style={{
            width: '100%',
            padding: '12px 0',
            borderRadius: 14,
            border: 'none',
            background:
              ni.a && ni.i
                ? 'linear-gradient(135deg,#b08acc,#9068b8)'
                : 'rgba(176,138,204,0.15)',
            color: ni.a && ni.i ? '#fff' : '#b0a0b8',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}
