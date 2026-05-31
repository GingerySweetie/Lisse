import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional label so the error UI knows where it came from. */
  label?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Minimal error boundary. Catches render-phase errors anywhere in its
 * subtree and shows the error + stack instead of leaving the user
 * staring at a blank page.
 *
 * Designed for production use — the previous "page flashes then goes
 * blank" symptom hid the root cause. With this in place the user can
 * read the message and forward it.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info);
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div
        style={{
          padding: '40px 20px',
          maxWidth: 720,
          margin: '0 auto',
          color: 'var(--text)',
          fontFamily: '-apple-system, sans-serif',
        }}
      >
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 22,
            color: 'var(--head)',
          }}
        >
          这一页崩了，但 app 没死
        </h2>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>
          {this.props.label ? `位置：${this.props.label}` : null}
        </p>
        <pre
          style={{
            marginTop: 14,
            padding: 12,
            background: 'var(--code-bg)',
            border: '1px solid var(--line-soft)',
            borderRadius: 'var(--r-code)',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#C45858',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
{e.name}: {e.message}
        </pre>
        {this.state.info?.componentStack && (
          <details
            style={{
              marginTop: 10,
              fontSize: 11,
              color: 'var(--text-3)',
            }}
          >
            <summary style={{ cursor: 'pointer' }}>组件栈</summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                background: 'var(--code-bg)',
                border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-code)',
                fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 180,
                overflowY: 'auto',
              }}
            >
              {this.state.info.componentStack}
            </pre>
          </details>
        )}
        <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
          <button type="button" className="btn-ghost" onClick={this.reset}>
            重试这一页
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => (window.location.href = '/home')}
          >
            回首页
          </button>
        </div>
      </div>
    );
  }
}
