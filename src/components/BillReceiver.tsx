import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import BillSniffer, { type CapturedBill } from '../lib/native/bill-sniffer';
import { db } from '../db';
import { newId } from '../lib/id';
import type { ExpenseCategory } from '../types';

/**
 * Listens for Android payment-notification captures and:
 *   1. Writes each one to the bills table (source: 'auto')
 *   2. Pops a centered in-app overlay so she sees the auto-entry the
 *      moment Wisteria next gains focus.
 *
 * Mount once inside <BrowserRouter>; renders an absolute-positioned
 * popup but no other layout.
 */

const POPUP_RECENCY_MS = 10 * 60 * 1000;

export default function BillReceiver() {
  const [queue, setQueue] = useState<CapturedBill[]>([]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    let handle: { remove: () => void } | undefined;

    async function persistAndQueue(b: CapturedBill, popup: boolean) {
      try {
        const sinceMs = Date.now() - 60_000;
        const recent = await db.bills
          .where('createdAt')
          .above(sinceMs)
          .toArray();
        const dup = recent.some(
          (r) => Math.abs(r.amount - b.amount) < 0.001 && r.item === b.merchant,
        );
        if (!dup) {
          const d = new Date(b.timestamp || Date.now());
          const ds = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
          await db.bills.add({
            id: newId(),
            date: ds,
            item: b.merchant,
            amount: b.amount,
            category: guessCategory(b.merchant),
            kind: 'expense',
            source: 'auto',
            createdAt: b.timestamp || Date.now(),
          });
        }
      } catch {
        // swallow — popup-only mode still useful if persist races.
      }
      if (popup && !cancelled) {
        setQueue((q) => [...q, b]);
      }
    }

    (async () => {
      try {
        const initial = await BillSniffer.getPendingBills();
        for (const b of initial.bills) {
          if (cancelled) return;
          const fresh = Date.now() - (b.timestamp || 0) < POPUP_RECENCY_MS;
          await persistAndQueue(b, fresh);
        }
        handle = await BillSniffer.addListener('billCaptured', (b) => {
          void persistAndQueue(b, true);
        });
      } catch {
        // plugin not available
      }
    })();

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  if (queue.length === 0) return null;
  const head = queue[0];
  const remaining = queue.length - 1;

  return (
    <BillPopup
      bill={head}
      remaining={remaining}
      onClose={() => setQueue((q) => q.slice(1))}
    />
  );
}

function BillPopup({
  bill,
  remaining,
  onClose,
}: {
  bill: CapturedBill;
  remaining: number;
  onClose: () => void;
}) {
  const category = guessCategory(bill.merchant);
  const sourceLabel = bill.source === 'alipay' ? '支付宝' : '微信支付';
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        background: 'rgba(40,30,55,0.42)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        animation: 'bill-mask-in 240ms ease both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 320,
          background: 'rgba(255,253,247,0.96)',
          borderRadius: 22,
          padding: '22px 22px 16px',
          boxShadow:
            '0 14px 44px rgba(46,36,72,0.25), inset 0 0 0 1px rgba(255,255,255,0.7)',
          animation:
            'bill-card-in 320ms cubic-bezier(0.2, 0.85, 0.3, 1.1) both',
          fontFamily: "-apple-system, 'PingFang SC', sans-serif",
          color: '#4a3550',
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9,
            fontWeight: 300,
            letterSpacing: '0.18em',
            color: '#b08344',
            textAlign: 'center',
            marginBottom: 14,
          }}
        >
          JUST PAID
        </div>

        <div
          style={{
            textAlign: 'center',
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 38,
            color: '#4a3550',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}
        >
          ¥{bill.amount.toFixed(2)}
        </div>

        <div
          style={{
            marginTop: 8,
            textAlign: 'center',
            fontSize: 13,
            color: '#7a5a88',
            letterSpacing: '0.04em',
          }}
        >
          {bill.merchant}
        </div>

        <div
          style={{
            marginTop: 14,
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: '#7a5a88',
              border: '1px solid rgba(176,131,68,0.3)',
              borderRadius: 9999,
              padding: '3px 10px',
              letterSpacing: '0.04em',
            }}
          >
            {sourceLabel}
          </span>
          <span
            style={{
              fontSize: 10,
              color: '#7a5a88',
              border: '1px solid rgba(176,131,68,0.3)',
              borderRadius: 9999,
              padding: '3px 10px',
              letterSpacing: '0.04em',
            }}
          >
            {category}
          </span>
        </div>

        {remaining > 0 && (
          <div
            style={{
              marginTop: 12,
              fontSize: 10,
              color: '#a090a8',
              textAlign: 'center',
              letterSpacing: 1,
            }}
          >
            还有 {remaining} 笔等查看
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            margin: '14px auto 0',
            display: 'block',
            padding: '6px 22px',
            fontFamily: "'Noto Sans SC', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            letterSpacing: '0.08em',
            color: '#b08344',
            borderRadius: 9999,
            background: 'rgba(232,196,104,0.18)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {remaining > 0 ? '下一个' : '收到'}
        </button>
      </div>

      <style>{`
        @keyframes bill-mask-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bill-card-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}

function guessCategory(merchant: string): ExpenseCategory {
  const m = merchant;
  if (/(餐|食|饭|麦|肯|星|咖啡|奶茶|茶|喜茶|霸|乐|外卖|美团|饿了么)/i.test(m))
    return '餐饮';
  if (/(打车|滴滴|地铁|公交|高德|加油|出行|火车|高铁|机票)/.test(m))
    return '交通';
  if (/(淘|京|拼|天猫|苹果|小米|商城|超市|便利|家乐福)/.test(m))
    return '购物';
  if (/(电|水|煤|话费|宽带|物业|药)/.test(m)) return '日用';
  if (/(电影|游戏|网易云|腾讯|爱奇艺|优酷|B站|哔哩|演出|票务)/.test(m))
    return '娱乐';
  if (/(医|院|诊|挂号|药店|体检)/.test(m)) return '医疗';
  return '日用';
}
