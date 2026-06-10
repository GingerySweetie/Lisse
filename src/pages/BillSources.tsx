import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { ChevronLeft } from 'lucide-react';
import { getSettings, saveSettings } from '../db';
import BillSniffer from '../lib/native/bill-sniffer';
import AccessibilityCapture from '../lib/native/accessibility-capture';

/**
 * Three bill-capture sources, each with its own toggle so the user
 * controls exactly which paths feed /billing. Defaults match the spec:
 *   - Notification (Alipay + WeChat):  ON
 *   - Notification (banks):            ON  (no effect until a real
 *                                          package name lands)
 *   - Accessibility screen read:       OFF (opt-in twice: here + system)
 */
export default function BillSourcesPage() {
  const settings = useLiveQuery(() => getSettings(), [], null);
  const [snifferEnabled, setSnifferEnabled] = useState<boolean | null>(null);
  const [accessEnabledInSystem, setAccessEnabledInSystem] =
    useState<boolean | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    async function poll() {
      try {
        const a = await BillSniffer.isEnabled();
        if (!cancelled) setSnifferEnabled(a.enabled);
      } catch {
        /* */
      }
      try {
        const b = await AccessibilityCapture.isEnabledInSystem();
        if (!cancelled) setAccessEnabledInSystem(b.enabled);
      } catch {
        /* */
      }
    }
    void poll();
    function onFocus() {
      void poll();
    }
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  async function toggle(
    key: 'billSrcAlipayWechat' | 'billSrcBankNotification' | 'billSrcScreenAccessibility',
    next: boolean,
  ) {
    await saveSettings({ [key]: next });
    if (key === 'billSrcScreenAccessibility') {
      try {
        await AccessibilityCapture.setEnabled({ enabled: next });
      } catch {
        /* native bridge missing on web */
      }
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/billing"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50"
        >
          <ChevronLeft size={16} />
          返回
        </Link>
        <h2 className="endpoint-card-title">设置 · 账单来源</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <p className="text-sm text-ink-500 leading-relaxed">
            自动入账的三条通道。每条都可以单独关。
            <br />
            通道把识别结果合并到一处账单，不重复也不漏。
          </p>

          {/* SOURCE 1: notification — Alipay + WeChat */}
          <SourceCard
            title="支付宝 / 微信支付通知"
            badge={
              snifferEnabled === true
                ? '通知监听已开启'
                : snifferEnabled === false
                  ? '通知监听未开启'
                  : null
            }
            enabled={settings?.billSrcAlipayWechat ?? true}
            onChange={(v) => void toggle('billSrcAlipayWechat', v)}
            description={
              <>
                监听支付宝 / 微信发出的「支付成功」通知，从文本里提金额和商家。
                <br />
                这是主通道，付款时基本都走这条。需要先开「通知使用权」。
              </>
            }
            actions={
              snifferEnabled === false && (
                <button
                  type="button"
                  onClick={() => void BillSniffer.openSettings().catch(() => {})}
                  className="rounded-md bg-lavender-200 px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:bg-lavender-300"
                >
                  打开「通知使用权」
                </button>
              )
            }
          />

          {/* SOURCE 2: notification — banks */}
          <SourceCard
            title="银行卡通知"
            badge={
              snifferEnabled === true
                ? '同一个通知监听'
                : snifferEnabled === false
                  ? '通知监听未开启'
                  : null
            }
            enabled={settings?.billSrcBankNotification ?? true}
            onChange={(v) => void toggle('billSrcBankNotification', v)}
            description={
              <>
                招行 / 农行 / 工行的扣款短信和 app 推送，文本一般是「消费人民币 X 元」。
                <br />
                <span className="text-amber-700">
                  注意：第一次使用需要付一笔款，
                  <Link to="/billing" className="underline">
                    /billing
                  </Link>{' '}
                  → 通知日志 里能看到银行的真实包名和文本，之后才能精准识别。
                </span>
              </>
            }
          />

          {/* SOURCE 3: accessibility screen read */}
          <SourceCard
            title="屏幕识别（仅支付宝 / 微信前台）"
            badge={
              accessEnabledInSystem === true
                ? '辅助功能已开启'
                : accessEnabledInSystem === false
                  ? '系统辅助功能未开启'
                  : null
            }
            warn
            enabled={settings?.billSrcScreenAccessibility ?? false}
            onChange={(v) => void toggle('billSrcScreenAccessibility', v)}
            description={
              <>
                零钱 / 当面付 / 扫码付不发通知，从屏幕上读「支付成功」附近的金额作补充。
                <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-ink-500">
                  <li>只在前台是支付宝（com.eg.android.AlipayGphone）或微信（com.tencent.mm）时才激活，其他 app 一律不读。</li>
                  <li>只抓金额数字节点，不截图、不保存屏幕内容、不上传任何东西。</li>
                  <li>识别完立刻丢弃节点数据，本地账单只多一条「金额 + 时间 + 来源」。</li>
                  <li>权限风险高，默认关；要开就同时打开下面的辅助功能。</li>
                </ul>
              </>
            }
            actions={
              <button
                type="button"
                onClick={() =>
                  void AccessibilityCapture.openAccessibilitySettings().catch(() => {})
                }
                className="rounded-md border border-lavender-200 px-3 py-1.5 text-xs text-ink-700 transition hover:bg-lavender-50"
              >
                打开「辅助功能」设置
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}

function SourceCard({
  title,
  badge,
  description,
  enabled,
  onChange,
  actions,
  warn,
}: {
  title: string;
  badge?: string | null;
  description: React.ReactNode;
  enabled: boolean;
  onChange: (v: boolean) => void;
  actions?: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <section
      className={`endpoint-card !mt-0 ${warn ? 'border-amber-200' : ''}`}
      style={{
        border: warn ? '1px solid rgba(232,196,104,0.45)' : undefined,
        background: warn ? 'rgba(255,251,240,0.65)' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink-900">{title}</h3>
            {badge && (
              <span className="text-[10px] text-ink-500/80">· {badge}</span>
            )}
          </div>
          <div className="mt-1.5 text-xs text-ink-500 leading-relaxed">
            {description}
          </div>
        </div>
        <Switch checked={enabled} onChange={onChange} />
      </div>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        flexShrink: 0,
        width: 44,
        height: 24,
        borderRadius: 9999,
        background: checked
          ? 'var(--color-lavender-400, #ad8fc9)'
          : 'rgba(160,140,200,0.25)',
        position: 'relative',
        transition: 'background 200ms ease',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(74,68,88,0.18)',
          transition: 'left 200ms ease',
        }}
      />
    </button>
  );
}
