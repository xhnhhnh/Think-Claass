import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import BrandMark from '@/components/BrandMark';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';

import { homePathForRole } from './homePath';

/**
 * A render error must not leave a blank screen.
 *
 * Every page is code-split and reads API data; one malformed row used to be enough to throw during
 * render and unmount the whole React tree, leaving a white document with no way back except a hard
 * reload. The boundary turns that into a readable state with a retry and a way home.
 *
 * There are two boundaries on purpose:
 *
 *   - `PageErrorBoundary` sits inside the shell's `<main>`, so a page crash keeps the rail and the
 *     account menu usable;
 *   - `AppErrorBoundary` sits above the routes, for an error in the shell itself.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** Changing this clears the error - navigating away from a broken page should try the new one. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] render error', error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) return this.props.fallback(error, this.reset);
    return this.props.children;
  }
}

/** A crashed page, rendered in the content area with the shell still around it. */
export function PageErrorBoundary({ children, resetKey }: { children: ReactNode; resetKey?: string }) {
  const navigate = useNavigate();

  return (
    <ErrorBoundary
      resetKey={resetKey}
      fallback={(error) => (
        <div
          role="alert"
          data-slot="page-error"
          className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-panel border border-danger/20 bg-danger/5 px-6 py-12 text-center"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertTriangle aria-hidden="true" className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-fg-1">这个页面出错了</h2>
            <p className="mt-1 text-sm text-fg-3">
              页面没有渲染完成，其他页面仍然可以正常使用。
            </p>
            <p className="mt-2 break-words text-xs text-fg-3">{error.message}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RotateCcw data-icon="inline-start" />
              重新加载页面
            </Button>
            <Button onClick={() => navigate(homePathForRole(useStore.getState().user?.role))}>
              回到控制台首页
            </Button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/** A crash outside the routes - the document itself cannot render its shell. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <div
          role="alert"
          className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface-1 px-6 text-center text-fg-3"
        >
          <span className="flex size-14 items-center justify-center rounded-panel bg-role-soft text-role">
            <BrandMark variant="glyph" className="size-8" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-fg-1">应用遇到问题</h1>
            <p className="mt-1 text-sm">这不是你的操作造成的。重新加载通常可以恢复。</p>
            <p className="mt-2 break-words text-xs">{error.message}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => window.location.reload()}>
              <RotateCcw data-icon="inline-start" />
              重新加载
            </Button>
            <Button variant="outline" onClick={() => window.location.assign('/')}>
              返回首页
            </Button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
