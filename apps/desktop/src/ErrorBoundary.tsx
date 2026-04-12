import {captureException} from '@sentry/react';
import {Component, type ErrorInfo, type ReactNode} from 'react';

type Props = {children: ReactNode};
type State = {error: Error | null};

export class ErrorBoundary extends Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Eskerra UI error:', error, info.componentStack);
    captureException(error, {
      extra: {componentStack: info.componentStack},
    });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="shell setup-shell" style={{padding: '1.5rem'}}>
          <h1>Something went wrong</h1>
          <p className="error" style={{whiteSpace: 'pre-wrap'}}>
            {this.state.error.message}
          </p>
          <p className="muted">Restart the app. If this persists, try Settings → Refresh from disk or clear saved panel layout in app data.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
