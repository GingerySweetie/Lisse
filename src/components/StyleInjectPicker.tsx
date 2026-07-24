import type { AppSettings } from '../types';

export type StyleUserInject = NonNullable<AppSettings['styleUserInject']>;

const OPTIONS: { value: StyleUserInject; label: string; title: string }[] = [
  { value: 'off', label: '关', title: '仅系统风格 + 短提醒（省缓存）' },
  { value: 'before', label: '消息前', title: '把完整风格注入到当前用户消息前面' },
  { value: 'after', label: '消息后', title: '把完整风格注入到当前用户消息后面' },
];

interface Props {
  value: StyleUserInject;
  onChange: (next: StyleUserInject) => void;
  /** Compact row for LeafMenu; default is the Styles-page block. */
  compact?: boolean;
}

/**
 * 普通聊天：完整写作风格是否注入到当前用户消息，以及放在消息前还是后。
 * 咨询室始终全文挂在消息后，不受此开关影响。
 */
export default function StyleInjectPicker({ value, onChange, compact }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="风格注入位置"
      style={{
        display: 'inline-flex',
        width: compact ? '100%' : undefined,
        borderRadius: 10,
        border: '1px solid hsla(270, 30%, 78%, 0.55)',
        background: 'hsla(270, 40%, 98%, 0.9)',
        overflow: 'hidden',
        padding: 2,
        gap: 2,
      }}
    >
      {OPTIONS.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              border: 0,
              cursor: 'pointer',
              borderRadius: 8,
              padding: compact ? '5px 6px' : '6px 12px',
              fontSize: compact ? 11 : 12,
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-serif, Georgia, serif)',
              color: on ? 'hsla(268, 35%, 28%, 0.95)' : 'hsla(268, 18%, 48%, 0.75)',
              background: on ? 'hsla(270, 45%, 90%, 0.95)' : 'transparent',
              transition: 'background 160ms ease, color 160ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
