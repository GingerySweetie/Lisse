import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import BillSniffer, { type CapturedBill } from '../lib/native/bill-sniffer';
import { db } from '../db';
import { newId } from '../lib/id';
import type { ExpenseCategory } from '../types';

/**
 * Listens for Android payment-notification captures and writes them
 * straight into the bills table. Mount once inside <BrowserRouter>;
 * no UI. The Billing page surfaces the "开启通知监听" prompt itself
 * when needed — this component only handles the data flow.
 */
export default function BillReceiver() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    let handle: { remove: () => void } | undefined;

    async function persist(b: CapturedBill) {
      try {
        // De-dup against the most recently created bill with the same
        // amount + merchant within 60 seconds — handles races between
        // the cold-drain and the live event firing for the same payment.
        const sinceMs = Date.now() - 60_000;
        const recent = await db.bills
          .where('createdAt')
          .above(sinceMs)
          .toArray();
        if (
          recent.some(
            (r) => Math.abs(r.amount - b.amount) < 0.001 && r.item === b.merchant,
          )
        ) {
          return;
        }
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
      } catch {
        // Swallow — better than crashing the receiver loop.
      }
    }

    (async () => {
      try {
        const initial = await BillSniffer.getPendingBills();
        for (const b of initial.bills) {
          if (cancelled) return;
          await persist(b);
        }
        handle = await BillSniffer.addListener('billCaptured', (b) => {
          void persist(b);
        });
      } catch {
        // Plugin not available — non-Android shim.
      }
    })();

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  return null;
}

/** Cheap merchant→category mapping. Anything we don't recognize falls
 *  through to 日用 (the most neutral default) — the user can re-tag in
 *  the Billing UI. Keep the dictionary boring: high precision over recall. */
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
