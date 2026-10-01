import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminWebsite from './AdminWebsitePage';

const mocks = vi.hoisted(() => ({
  getHomeContent: vi.fn(),
  updateHomeContent: vi.fn(),
}));

vi.mock('@/features/portal/api/portalApi', () => ({
  portalApi: {
    getHomeContent: mocks.getHomeContent,
    updateHomeContent: mocks.updateHomeContent,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/**
 * 网站设置 - the data-loss guard.
 *
 * The form saves by upserting whatever it holds (`portal.repository` writes
 * `ON CONFLICT ... DO UPDATE SET content_json = excluded.content_json`), so a load that failed and
 * left the form empty used to turn the next save into "overwrite the live homepage with blanks".
 * The page must not offer that save until it has real content in hand.
 */
describe('AdminWebsite', () => {
  beforeEach(() => {
    mocks.getHomeContent.mockReset();
    mocks.updateHomeContent.mockReset();
  });

  it('prefills the form from the server and saves it back', async () => {
    mocks.getHomeContent.mockResolvedValue({
      success: true,
      data: { hero: { title: '标题', subtitle: '副标题', buttonText: '开始' }, features: [], about: { title: '关于', content: '正文' } },
    });
    mocks.updateHomeContent.mockResolvedValue({ success: true });

    render(<AdminWebsite />);

    const title = await screen.findByDisplayValue('标题');
    fireEvent.change(title, { target: { value: '新标题' } });
    fireEvent.click(screen.getByRole('button', { name: '保存内容' }));

    await waitFor(() =>
      expect(mocks.updateHomeContent).toHaveBeenCalledWith(
        expect.objectContaining({ hero: expect.objectContaining({ title: '新标题' }) }),
      ),
    );
  });

  it('refuses to render a saveable empty form when the load failed', async () => {
    mocks.getHomeContent.mockRejectedValue(new Error('offline'));

    render(<AdminWebsite />);

    expect(await screen.findByText('网站内容没有加载成功')).toBeInTheDocument();
    // No form, so no field to blank out and no save to press.
    expect(screen.queryByRole('button', { name: '保存内容' })).not.toBeInTheDocument();
    expect(mocks.updateHomeContent).not.toHaveBeenCalled();
  });

  it('recovers through the retry, and only then is the form editable', async () => {
    mocks.getHomeContent.mockRejectedValueOnce(new Error('offline'));
    mocks.getHomeContent.mockResolvedValueOnce({
      success: true,
      data: { hero: { title: '回来了', subtitle: '', buttonText: '' }, features: [], about: { title: '', content: '' } },
    });

    render(<AdminWebsite />);
    fireEvent.click(await screen.findByRole('button', { name: '重新加载' }));

    expect(await screen.findByDisplayValue('回来了')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存内容' })).toBeInTheDocument();
  });
});
