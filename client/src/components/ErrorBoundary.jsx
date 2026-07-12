import { Component } from 'react';

// Without a boundary, any render-time throw blanks the whole SPA. This catches
// it, shows a recoverable message, and surfaces the error (console + on screen)
// so it can be diagnosed instead of appearing as a silent "break".
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('UI crash:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="page-center">
          <div className="card error-card">
            <h2 className="card-title">Something went wrong</h2>
            <p className="card-hint">
              This view hit an unexpected error. You can retry, or reload the page.
            </p>
            <pre className="crash-detail">{String(this.state.error?.message || this.state.error)}</pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={this.reset}>
                Retry
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
