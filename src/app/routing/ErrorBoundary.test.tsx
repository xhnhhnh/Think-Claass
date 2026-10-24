import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary, PageErrorBoundary } from './ErrorBoundary';

function Broken(): JSX.Element {
  throw new Error('bad row');
}

describe('error boundaries', () => {
  beforeEach(() => {
    // React logs the caught error; that is expected in these tests and would otherwise flood the run.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the shell around a crashed page and offers a reload', () => {
    render(
      <MemoryRouter>
        <div data-testid="shell">
          <PageErrorBoundary>
            <Broken />
          </PageErrorBoundary>
        </div>
      </MemoryRouter>,
    );

    expect(screen.getByText('这个页面出错了')).toBeInTheDocument();
    expect(screen.getByText('bad row')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重新加载页面/ })).toBeInTheDocument();
  });

  it('has a whole-document fallback for a crash above the routes', () => {
    render(
      <MemoryRouter>
        <AppErrorBoundary>
          <Broken />
        </AppErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('应用遇到问题')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重新加载/ })).toBeInTheDocument();
  });
});
