import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Catches a screen that fails to load or render (for example a chunk that cannot be fetched) so the shell,
 * navigation and the demonstration banner stay usable. `resetKey` clears the error when the route changes.
 */
export class ScreenErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean; key: string }
> {
  override state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="m-4 max-w-xl rounded-xl border border-line bg-panel px-5 py-4">
        <h1 className="text-lg text-ink">This screen could not be loaded</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The connection may have dropped, or TIGERIS was updated while this tab was open. Nothing was
          recorded.
        </p>
        <Button variant="primary" size="sm" className="mt-3" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
