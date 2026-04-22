import {Component, type ErrorInfo, type ReactNode} from 'react';

import {formatCrashDetails} from './observability/reportCrash';

type Props = {children: ReactNode};
type State = {error: Error | null; componentStack: string | null; copied: boolean};

/**
 * UI-only boundary. Crash reporting lives in the `createRoot(onCaughtError)` callback (see
 * `main.tsx`) so every path (boundary-caught, uncaught, window errors) funnels through one
 * `reportCrash` call and doesn't duplicate Sentry events.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {error: null, componentStack: null, copied: false};

  static getDerivedStateFromError(error: Error): State {
    return {error, componentStack: null, copied: false};
  }

  componentDidCatch(_error: Error, info: ErrorInfo): void {
    this.setState({componentStack: info.componentStack ?? null});
  }

  copyDetails = (): void => {
    const {error, componentStack} = this.state;
    if (!error) return;
    const text = formatCrashDetails(error, componentStack);
    void navigator.clipboard.writeText(text).then(
      () => {
        this.setState({copied: true});
        window.setTimeout(() => this.setState({copied: false}), 2000);
      },
      (e: unknown) => console.warn('[eskerra:ErrorBoundary] copy failed', e),
    );
  };

  render(): ReactNode {
    const {error, componentStack, copied} = this.state;
    if (!error) {
      return this.props.children;
    }
    const details = formatCrashDetails(error, componentStack);
    return (
      <div
        className="shell setup-shell"
        style={{
          padding: '1.5rem',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        <h1 style={{margin: 0}}>Something went wrong</h1>
        <p className="error" style={{whiteSpace: 'pre-wrap', margin: 0}}>
          {error.message}
        </p>
        <p className="muted" style={{margin: 0}}>
          Restart the app. If this persists, try Settings → Refresh from disk or clear saved panel
          layout in app data.
        </p>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <button type="button" onClick={this.copyDetails}>
            {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.75rem',
            opacity: 0.75,
            maxHeight: '50vh',
            overflow: 'auto',
            padding: '0.5rem',
            border: '1px solid currentColor',
            borderRadius: 4,
          }}
        >
          {details}
        </pre>
      </div>
    );
  }
}
